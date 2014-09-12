#! /usr/bin/env node

var konabot     = require('commander'),
    packageInfo = require('../package.json');

pickaxe
  .version(packageInfo.version)
  .option('-c, --config <path>', 'set config path; defaults to ~/pickaxe.yml unless specified in PICKAXE_CONFIG_PATH');

pickaxe
  .command('init [path]')
  .description("creates a default pickaxe.yml file in [path]")
  .action(function (path) {
    init(path || pickaxe.config, function (configPath) {
      console.log("Generated a sample config file at \"%s\"", configPath);
    });
  });

pickaxe
  .command('start [world]')
  .description("starts [world], or attempts to start all worlds if [world] is omitted")
  .action(function (world) {
    loadConfig(pickaxe.config, function (config) {
      console.log(config);
    });
  });

pickaxe.parse(process.argv);
