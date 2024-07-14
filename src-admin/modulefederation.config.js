const { shared } = require('@iobroker/adapter-react-v5/modulefederation.admin.config');


module.exports = {
    name: 'ConfigCustomParserSet',
    filename: 'customComponents.js',
    exposes: {
        './Components': './src/Components.jsx',
    },
    shared,
};
