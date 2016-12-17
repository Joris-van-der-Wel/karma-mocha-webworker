'use strict';
/* eslint no-eval: off */

const RPCWorker = require('./rpc');

const context = global;
const rpc = new RPCWorker(context);
const PENDING = Symbol();
const globalEval = eval;

function formatError(error) {
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
}


function reporterConstructor(runner) {
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
}

rpc.addNotifyMethods({
        importScripts(scripts) {
                console.info('[karma-mocha-webworker] Importing scripts into worker:', scripts);
                context.importScripts(...scripts);
        },
        eval(code) {
                // aliasing eval ensures that it runs in the global scope, just like setTimeout('foo()');
                // http://www.ecma-international.org/ecma-262/5.1/#sec-10.4.2
                globalEval(code);
        },
        setupMocha(config) { // karma.config.mochaWebWorker
                console.info('[karma-mocha-webworker] Initialize mocha.', config);

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
                console.info('[karma-mocha-webworker] Run mocha');

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
                                console.log('[karma-mocha-webworker] mocha grep:', grep);
                                context.mocha.grep(grep);
                        }
                }

                context.mocha.run(() => {
                        rpc.notify('mochaRunComplete');
                });
        },
});

context.onmessage = e => rpc.handleMessage(e.data);

// a little hack to make mocha function in a worker context
context.window = context; // ( deleted in initializeMocha() )

rpc.notify('ready');
