#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KIND_NAMES = ['function', 'table', 'memory', 'global', 'tag'];

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--wasm' || value === '--game-js' || value === '--baseline') {
            args[value.slice(2)] = argv[++index];
        } else if (value === '--json') {
            args.json = true;
        } else if (value === '--help' || value === '-h') {
            args.help = true;
        } else {
            throw new Error(`未知参数：${value}`);
        }
    }
    return args;
}

function usage() {
    return [
        '用法：',
        '  npm run inspect:tsdk -- --wasm <tsdk.wasm> [--game-js <game.js>]',
        '    [--baseline <旧版.wasm>] [--json]',
        '',
        '示例：',
        '  npm run inspect:tsdk -- --wasm /tmp/tsdk.wasm \\',
        '    --game-js /tmp/game.js --baseline src/utils/tsdk-v3.8.6.wasm',
    ].join('\n');
}

function readU32(buffer, state) {
    let value = 0;
    let shift = 0;
    let byte;
    do {
        if (state.offset >= buffer.length) throw new Error('WASM LEB128 越界');
        byte = buffer[state.offset++];
        value += (byte & 0x7F) * (2 ** shift);
        shift += 7;
    } while (byte & 0x80);
    return value;
}

function readS32(buffer, state) {
    let value = 0;
    let shift = 0;
    let byte;
    do {
        if (state.offset >= buffer.length) throw new Error('WASM LEB128 越界');
        byte = buffer[state.offset++];
        value |= (byte & 0x7F) << shift;
        shift += 7;
    } while (byte & 0x80);
    if (shift < 32 && (byte & 0x40)) value |= ~0 << shift;
    return value | 0;
}

function readString(buffer, state) {
    const length = readU32(buffer, state);
    const end = state.offset + length;
    if (end > buffer.length) throw new Error('WASM 字符串越界');
    const value = buffer.subarray(state.offset, end).toString('utf8');
    state.offset = end;
    return value;
}

function skipLimits(buffer, state) {
    const flags = readU32(buffer, state);
    readU32(buffer, state);
    if (flags & 1) readU32(buffer, state);
}

function parseConstOffset(buffer, state) {
    const opcode = buffer[state.offset++];
    if (opcode !== 0x41) {
        throw new Error(`暂不支持的数据段偏移表达式 opcode=0x${opcode.toString(16)}`);
    }
    const offset = readS32(buffer, state);
    if (buffer[state.offset++] !== 0x0B) throw new Error('数据段偏移表达式缺少 end');
    return offset;
}

function extractI32Constants(body) {
    const state = { offset: 0 };
    const groups = readU32(body, state);
    for (let index = 0; index < groups; index += 1) {
        readU32(body, state);
        state.offset += 1;
    }

    const constants = [];
    while (state.offset < body.length) {
        const opcode = body[state.offset++];
        if (opcode === 0x41) {
            constants.push(readS32(body, state));
        } else if (
            opcode === 0x0C || opcode === 0x0D || opcode === 0x10
            || (opcode >= 0x20 && opcode <= 0x24)
        ) {
            readU32(body, state);
        } else if (opcode === 0x11) {
            readU32(body, state);
            readU32(body, state);
        } else if (opcode >= 0x28 && opcode <= 0x3E) {
            readU32(body, state);
            readU32(body, state);
        } else if (opcode === 0x3F || opcode === 0x40) {
            readU32(body, state);
        }
    }
    return constants;
}

function parseWasm(file) {
    const buffer = fs.readFileSync(file);
    if (buffer.length < 8 || buffer.subarray(0, 4).toString('hex') !== '0061736d') {
        throw new Error(`${file} 不是有效的 WebAssembly 文件`);
    }

    const state = { offset: 8 };
    const imports = [];
    const exports = [];
    const dataSegments = [];
    const codeBodies = [];
    let importedFunctions = 0;

    while (state.offset < buffer.length) {
        const sectionId = buffer[state.offset++];
        const sectionSize = readU32(buffer, state);
        const sectionEnd = state.offset + sectionSize;

        if (sectionId === 2) {
            const count = readU32(buffer, state);
            for (let index = 0; index < count; index += 1) {
                const module = readString(buffer, state);
                const name = readString(buffer, state);
                const kind = buffer[state.offset++];
                imports.push({ module, name, kind: KIND_NAMES[kind] || `kind-${kind}` });
                if (kind === 0) {
                    readU32(buffer, state);
                    importedFunctions += 1;
                } else if (kind === 1) {
                    state.offset += 1;
                    skipLimits(buffer, state);
                } else if (kind === 2) {
                    skipLimits(buffer, state);
                } else if (kind === 3) {
                    state.offset += 2;
                } else if (kind === 4) {
                    state.offset += 1;
                    readU32(buffer, state);
                } else {
                    throw new Error(`不支持的 import kind=${kind}`);
                }
            }
        } else if (sectionId === 7) {
            const count = readU32(buffer, state);
            for (let index = 0; index < count; index += 1) {
                const name = readString(buffer, state);
                const kind = buffer[state.offset++];
                const itemIndex = readU32(buffer, state);
                exports.push({ name, kind: KIND_NAMES[kind] || `kind-${kind}`, index: itemIndex });
            }
        } else if (sectionId === 10) {
            const count = readU32(buffer, state);
            for (let index = 0; index < count; index += 1) {
                const length = readU32(buffer, state);
                codeBodies.push(buffer.subarray(state.offset, state.offset + length));
                state.offset += length;
            }
        } else if (sectionId === 11) {
            const count = readU32(buffer, state);
            for (let index = 0; index < count; index += 1) {
                const flags = readU32(buffer, state);
                let memory = 0;
                let offset = null;
                if (flags === 0 || flags === 2) {
                    if (flags === 2) memory = readU32(buffer, state);
                    offset = parseConstOffset(buffer, state);
                }
                const length = readU32(buffer, state);
                dataSegments.push({ memory, offset, length });
                state.offset += length;
            }
        }
        state.offset = sectionEnd;
    }

    const decryptExport = exports.find(item => item.name === 'decrypt_all_data' && item.kind === 'function');
    const decryptBody = decryptExport
        ? codeBodies[decryptExport.index - importedFunctions]
        : null;
    const decryptConstants = decryptBody ? extractI32Constants(decryptBody) : [];
    const repeatedConstants = [...new Set(decryptConstants)]
        .map(value => ({
            value,
            occurrences: decryptConstants.filter(candidate => candidate === value).length,
        }))
        .filter(item => item.occurrences >= 2)
        .sort((left, right) => right.occurrences - left.occurrences);

    return {
        file: path.resolve(file),
        size: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        imports,
        exports,
        dataSegments,
        decryptAllData: {
            functionIndex: decryptExport?.index ?? null,
            repeatedConstants,
        },
    };
}

function samePublicShape(left, right, key) {
    const normalize = item => {
        if (key === 'imports') {
            return { module: item.module, name: item.name, kind: item.kind };
        }
        if (key === 'exports') return { name: item.name, kind: item.kind };
        return item;
    };
    return JSON.stringify(left[key].map(normalize)) === JSON.stringify(right[key].map(normalize));
}

function inspectGameJs(file) {
    const source = fs.readFileSync(file, 'utf8');
    const versions = [...new Set(source.match(/v\d+\.\d+\.\d+\.\d+/g) || [])];
    return {
        file: path.resolve(file),
        size: Buffer.byteLength(source),
        tsdkVersions: versions.filter(version => version.startsWith('v3.')),
        markers: {
            loadsTsdkWasm: source.includes('tsdk/tsdk.wasm'),
            sdkInitEx: source.includes('SdkInitEx'),
            anoUserLogin: source.includes('AnoUserLogin'),
            aceManager: source.includes('AceManager'),
            gameId3167: source.includes('3167'),
            appId1112386029: source.includes('1112386029'),
        },
    };
}

function printHuman(report) {
    console.log(`WASM: ${report.wasm.file}`);
    console.log(`大小: ${report.wasm.size} bytes`);
    console.log(`SHA-256: ${report.wasm.sha256}`);
    console.log(`imports (${report.wasm.imports.length}): ${report.wasm.imports.map(item => `${item.module}.${item.name}:${item.kind}`).join(', ')}`);
    console.log(`exports (${report.wasm.exports.length}): ${report.wasm.exports.map(item => `${item.name}:${item.kind}`).join(', ')}`);
    console.log(`数据段 (${report.wasm.dataSegments.length}): ${report.wasm.dataSegments.map(item => `[${item.offset}, ${item.length}]`).join(', ')}`);
    console.log(`decrypt_all_data 重复常量候选: ${report.wasm.decryptAllData.repeatedConstants.map(item => `${item.value}×${item.occurrences}`).join(', ') || '无'}`);
    if (report.gameJs) {
        console.log(`game.js: ${report.gameJs.file}`);
        console.log(`TSDK 版本候选: ${report.gameJs.tsdkVersions.join(', ') || '未找到'}`);
        console.log(`关键标记: ${Object.entries(report.gameJs.markers).map(([key, value]) => `${key}=${value}`).join(', ')}`);
    }
    if (report.compatibility) {
        console.log(`基线: ${report.compatibility.baseline}`);
        console.log(`结构兼容: imports=${report.compatibility.imports}, exports=${report.compatibility.exports}, dataSegments=${report.compatibility.dataSegments}`);
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.wasm) {
        console.log(usage());
        process.exitCode = args.help ? 0 : 1;
        return;
    }

    const wasm = parseWasm(args.wasm);
    const report = {
        wasm,
        gameJs: args['game-js'] ? inspectGameJs(args['game-js']) : null,
        compatibility: null,
    };
    if (args.baseline) {
        const baseline = parseWasm(args.baseline);
        report.compatibility = {
            baseline: baseline.file,
            imports: samePublicShape(wasm, baseline, 'imports'),
            exports: samePublicShape(wasm, baseline, 'exports'),
            dataSegments: samePublicShape(wasm, baseline, 'dataSegments'),
        };
    }

    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
}

try {
    main();
} catch (error) {
    console.error(`TSDK 检查失败：${error.message}`);
    process.exitCode = 1;
}
