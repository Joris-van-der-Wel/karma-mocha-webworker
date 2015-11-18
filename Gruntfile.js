'use strict';

const path = require('path');
const fs = require('fs');
const pkg = require('./package.json');

module.exports = grunt => {
        grunt.initConfig({
                pkg        : pkg,
                jshint     : {
                        options: pkg.jshintConfig,
                        src    : ['*.js', 'lib/**/*.js', 'test/**/*.js']
                },
                jscs       : {
                        options: {
                                config: true // default loading
                        },
                        src    : ['*.js', 'lib/**/*.js', 'test/**/*.js']
                },
                browserify : {
                        options: {
                                transform: [
                                        ['babelify', {
                                                presets: ['es2015']
                                        }]
                                ]
                        },
                        worker : {
                                src    : 'lib/worker.js',
                                dest   : 'karma-mocha-webworker-client/worker.js'
                        },
                        adapter: {
                                src    : 'lib/adapter.js',
                                dest   : 'karma-mocha-webworker-client/adapter.js'
                        }
                }
        });

        // (so that we can test)
        grunt.registerTask('create-self-referencing-module', () => {
                const modulePath = path.resolve('node_modules', pkg.name);

                if (!fs.existsSync(modulePath)) {
                        fs.mkdirSync(modulePath); // (throw if it is not a directory)
                }

                fs.writeFileSync(
                        path.resolve(modulePath, 'index.js'),
                        'module.exports=require("../..")'
                );

                // https://github.com/npm/npm/issues/9766
                fs.writeFileSync(
                        path.resolve(modulePath, 'package.json'),
                        JSON.stringify({name: 'karma-mocha-webworker-self-reference'})
                );
        });


        grunt.loadNpmTasks('grunt-browserify');
        grunt.loadNpmTasks('grunt-contrib-jshint');
        grunt.loadNpmTasks('grunt-jscs');

        grunt.registerTask('build', ['browserify:adapter', 'browserify:worker']);
        grunt.registerTask('lint', ['jshint', 'jscs']);
        grunt.registerTask('default', ['create-self-referencing-module', 'lint', 'build']);
};
