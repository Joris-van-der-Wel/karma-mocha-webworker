'use strict';
/* global self */
/* eslint no-eval: off */

self.JSONBird = require('jsonbird');

self.onconnect = function (e) {
        const context = self;
        const port = e.ports[0];
        const PENDING = Symbol();
        const globalEval = eval;
        const rpc = new self.JSONBird({
                readableMode: 'object',
                writableMode: 'object',
                receiveErrorStack: true,
                sendErrorStack: true,
        });

        port.onmessage = e => rpc.write(e.data);
        rpc.on('error', error => console.error('[karma-mocha-webworker SharedWorker] Error during RPC', error, error.stack));
        rpc.on('data', object => port.postMessage(object));

        const formatError = error => {
                let stack = error.stack;
                const message = error.message;

                if (stack) {
                        if (message && stack.indexOf(message) === -1) {
                                stack = message + '\n' + stack;
                        }

                        // remove mocha stack entries
                        return stack.replace(/\n.+\/mocha\/mocha.js\?\w*\:.+(?=(\n|$))/g, '');
                }

                return message;
        };

        const reporterConstructor = runner => {
                // runner events:
                // - start     ()
                // - end       ()
                // - suite     (suite)
                // - suite end (suite)
                // - test      (test)
                // - test end  (test)
                // - pass      (test)
                // - fail      (test, err)
                // - pending   (test)
                // - waiting   (rootSuite)
                // - hook      (hook)
                // - hook end  (hook)

                runner.on('start', () => {
                        rpc.notify('karmaInfo', {
                                total: runner.total,
                        });
                });

                runner.on('end', () => {
                        rpc.notify('karmaComplete', {
                                coverage: global.__coverage__,
                        });
                });

                runner.on('test', test => {
                        test.$errors = [];
                });

                runner.on('fail', (test, error) => {
                        if (test.type === 'hook') {
                                test.$errors = [formatError(error)];
                                runner.emit('test end', test);
                        }
                        else {
                                test.$errors.push(formatError(error));
                        }
                });


                runner.on('pending', test => {
                        // this.skip() fires this event, but does not set test.pending = true;
                        // use a Symbol to avoid interfering with mocha internals
                        test[PENDING] = true;
                });

                runner.on('test end', test => {
                        const skipped = test.pending === true || test[PENDING] === true;

                        const result = {
                                id: '',
                                description: test.title,
                                suite: [],
                                success: test.state === 'passed',
                                skipped: skipped,
                                time: skipped ? 0 : test.duration,
                                log: test.$errors || [],
                        };

                        let pointer = test.parent;

                        while (!pointer.root) {
                                result.suite.unshift(pointer.title);
                                pointer = pointer.parent;
                        }

                        rpc.notify('karmaResult', result);
                });
        };

        rpc.methods({
                importScripts(scripts) {
                        console.info('[karma-mocha-webworker SharedWorker] Importing scripts into worker:', scripts);
                        context.importScripts(...scripts);
                },
                eval(code) {
                        // the lifecycle scripts may return a promise to indicate that we should wait
                        // before moving on to the next phase
                        return Promise.resolve(
                                // aliasing eval ensures that it runs in the global scope, just like setTimeout('foo()');
                                // http://www.ecma-international.org/ecma-262/5.1/#sec-10.4.2
                                globalEval(code)
                        ).then(() => true);
                },
                setupMocha(config) { // karma.config.mochaWebWorker
                        console.info('[karma-mocha-webworker SharedWorker] Initialize mocha.', config);

                        const mochaConfig = {
                                reporter: reporterConstructor,
                                ui: 'bdd',
                                globals: ['__cov*'],
                        };

                        const configKeys = Object.keys(config || {});

                        // Copy all properties to mochaConfig
                        for (const key of configKeys) {
                                // except for reporter
                                if (key === 'reporter') {
                                        continue;
                                }

                                // and merge the globals if they exist.
                                if (key === 'globals') {
                                        mochaConfig.globals = mochaConfig.globals.concat(config[key]);

                                        continue;
                                }

                                mochaConfig[key] = config[key];
                        }

                        context.mocha.setup(mochaConfig);
                        delete context.window;
                },
                runMocha(clientArguments) {
                        console.info('[karma-mocha-webworker SharedWorker] Run mocha');

                        if (clientArguments) {
                                let grep = false;

                                if (Array.isArray(clientArguments)) {

                                        clientArguments.reduce((isGrepArg, arg) => {
                                                if (isGrepArg) {
                                                        grep = arg;

                                                        return false;
                                                }

                                                if (arg === '--grep') {
                                                        return true; // isGrepArg
                                                }

                                                let match;

                                                if ((match = /^--grep=(.*)$/.exec(arg))) {
                                                        grep = match[1];
                                                }

                                                return false;
                                        }, false);
                                }
                                else if (clientArguments.grep) {
                                        grep = clientArguments.grep;
                                }

                                if (grep) {
                                        console.log('[karma-mocha-webworker SharedWorker] mocha grep:', grep);
                                        context.mocha.grep(grep);
                                }
                        }

                        context.mocha.run(() => {
                                rpc.notify('mochaRunComplete');
                        });
                },
        });

        // a little hack to make mocha function in a worker context
        context.window = context; // ( deleted in initializeMocha() )

        rpc.notify('ready');
};
