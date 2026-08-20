const crypto = require('node:crypto');
const os = require('node:os');
const { execSync } = require('node:child_process');
const process = require('node:process');

const VIRTUAL_ADAPTER_PREFIXES = [
    'VMware', 'VirtualBox', 'VBox', 'Hyper-V', 'TAP', 'Tunnel', 'VPN',
    'Loopback', 'Bluetooth', 'Wireless Pan', 'WSL', 'Docker', 'vEthernet',
    'Virtual', 'Pseudo', 'Teredo', 'ISATAP', '6to4', 'Hamachi', 'ZeroTier',
    'Tailscale', 'NordVPN', 'ExpressVPN', 'Surfshark', 'ProtonVPN',
];

function isVirtualAdapter(name) {
    const lowerName = (name || '').toLowerCase();
    return VIRTUAL_ADAPTER_PREFIXES.some((prefix) => lowerName.includes(prefix.toLowerCase()));
}

function getStableMacAddress() {
    const interfaces = os.networkInterfaces();
    const validMacs = [];

    for (const [name, ifaces] of Object.entries(interfaces)) {
        if (isVirtualAdapter(name)) continue;
        if (!ifaces) continue;

        for (const iface of ifaces) {
            if (!iface.mac) continue;
            if (iface.mac === '00:00:00:00:00:00') continue;
            if (iface.internal) continue;
            if (iface.family !== 'IPv4') continue;

            const mac = iface.mac.toUpperCase().replace(/:/g, '');
            if (mac.startsWith('00') || mac.startsWith('02')) continue;

            validMacs.push({
                name,
                mac,
                priority: iface.family === 'IPv4' ? 0 : 1,
            });
        }
    }

    if (validMacs.length === 0) return null;

    validMacs.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.name.localeCompare(b.name);
    });

    return validMacs[0].mac;
}

function getWindowsMachineId() {
    try {
        const result = execSync('wmic csproduct get UUID', { encoding: 'utf8', timeout: 5000 });
        const lines = result.trim().split('\n');
        if (lines.length >= 2) {
            const uuid = lines[1].trim();
            if (uuid && uuid !== 'UUID' && uuid.length > 10) {
                return uuid.toUpperCase().replace(/-/g, '');
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function getWindowsBiosSerial() {
    try {
        const result = execSync('wmic bios get SerialNumber', { encoding: 'utf8', timeout: 5000 });
        const lines = result.trim().split('\n');
        if (lines.length >= 2) {
            const serial = lines[1].trim();
            if (serial && serial !== 'SerialNumber' && serial.length > 3) {
                return serial.toUpperCase().replace(/\s/g, '');
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function getWindowsBaseboardSerial() {
    try {
        const result = execSync('wmic baseboard get SerialNumber', { encoding: 'utf8', timeout: 5000 });
        const lines = result.trim().split('\n');
        if (lines.length >= 2) {
            const serial = lines[1].trim();
            if (serial && serial !== 'SerialNumber' && serial.length > 3) {
                return serial.toUpperCase().replace(/\s/g, '');
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function getLinuxMachineId() {
    try {
        const fs = require('node:fs');
        const machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        if (machineId && machineId.length > 10) {
            return machineId.toUpperCase().replace(/-/g, '');
        }
    } catch {
        // ignore
    }
    return null;
}

function getLinuxDmiUuid() {
    try {
        const fs = require('node:fs');
        const uuid = fs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim();
        if (uuid && uuid.length > 10) {
            return uuid.toUpperCase().replace(/-/g, '');
        }
    } catch {
        // ignore
    }
    return null;
}

function getMacMachineId() {
    try {
        const result = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
            encoding: 'utf8',
            timeout: 5000,
        });
        const match = result.match(/IOPlatformUUID\s*=\s*"([^"]+)"/);
        if (match && match[1] && match[1].length > 10) {
            return match[1].toUpperCase().replace(/-/g, '');
        }
    } catch {
        // ignore
    }
    return null;
}

function getStableIdentifiers() {
    const platform = process.platform;
    const identifiers = [];

    if (platform === 'win32') {
        const uuid = getWindowsMachineId();
        if (uuid) identifiers.push({ type: 'uuid', value: uuid });

        const biosSerial = getWindowsBiosSerial();
        if (biosSerial) identifiers.push({ type: 'bios', value: biosSerial });

        const baseboardSerial = getWindowsBaseboardSerial();
        if (baseboardSerial) identifiers.push({ type: 'baseboard', value: baseboardSerial });
    } else if (platform === 'linux') {
        const machineId = getLinuxMachineId();
        if (machineId) identifiers.push({ type: 'machine-id', value: machineId });

        const dmiUuid = getLinuxDmiUuid();
        if (dmiUuid) identifiers.push({ type: 'dmi-uuid', value: dmiUuid });
    } else if (platform === 'darwin') {
        const platformUuid = getMacMachineId();
        if (platformUuid) identifiers.push({ type: 'platform-uuid', value: platformUuid });
    }

    return identifiers;
}

function getStableIdentifier() {
    const identifiers = getStableIdentifiers();
    return identifiers.length > 0 ? identifiers[0] : null;
}

function generateMachineId() {
    const identifiers = getStableIdentifiers();

    if (identifiers.length > 0) {
        const combinedValue = identifiers.map((id) => id.value).join('|');
        const hash = crypto.createHash('sha256').update(combinedValue).digest('hex').toUpperCase();
        return hash.substring(0, 16);
    }

    const fallback = os.hostname() + String(os.totalmem()) + (os.cpus()[0]?.model || '');
    const hash = crypto.createHash('sha256').update(fallback).digest('hex').toUpperCase();
    return hash.substring(0, 16);
}

function getMachineIdDisplay() {
    const raw = generateMachineId();
    return raw.match(/.{1,4}/g)?.join('-') || raw;
}

function getIdentifierInfo() {
    const identifier = getStableIdentifier();
    return {
        platform: process.platform,
        type: identifier?.type || 'fallback',
        value: identifier?.value || null,
        machineId: generateMachineId(),
        displayId: getMachineIdDisplay(),
    };
}

module.exports = {
    generateMachineId,
    getMachineIdDisplay,
    getIdentifierInfo,
    getStableMacAddress,
    getStableIdentifiers,
};
