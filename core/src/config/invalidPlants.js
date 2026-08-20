const invalidPlants = require('../gameConfig/InvalidPlants.json');

const invalidPlantIds = new Set((invalidPlants.plant_ids || []).map(Number));
const invalidSeedIds = new Set((invalidPlants.seed_ids || []).map(Number));

function isInvalidPlant(plant) {
    return invalidPlantIds.has(Number(plant && plant.id))
        || isInvalidSeedId(plant && plant.seed_id);
}

function isInvalidSeedId(seedId) {
    return invalidSeedIds.has(Number(seedId));
}

function filterInvalidPlants(plants) {
    return (Array.isArray(plants) ? plants : []).filter(plant => !isInvalidPlant(plant));
}

module.exports = {
    filterInvalidPlants,
    isInvalidPlant,
    isInvalidSeedId,
};
