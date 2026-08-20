const process = require('node:process');

/**
 * License config.
 * Keep the feature available, but disable it by default during rebuild.
 * Set FARM_LICENSE_ENABLED=true to enforce validation.
 */
module.exports = {
    LICENSE_ENABLED: process.env.FARM_LICENSE_ENABLED === 'true',
};
