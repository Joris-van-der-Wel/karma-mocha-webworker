'use strict';

const minimatch = require('minimatch');
const RPCWorker = require('./rpc');
const Worker = global.Worker;
const karma = global.__karma__;

function patternsFromConfig(configValue) {
        const patterns = [];

        for (const pattern of (Array.isArray(configValue) ? configValue : [configValue])) {
                if (!pattern) {
                        continue;
                }

                const patternFn = minimatch.filter(pattern, {
                        matchBase: true
                });

                patterns.push(patternFn);
        }

        return patterns;
}

function urlMatchesPatterns(patterns, url) {
        const matchUrl = url.replace(/^\/base\//, '');

        for (const pattern of patterns) {
                if (pattern(matchUrl)) {
                        return true;
                }
        }

        return false;
}

karma.start = () => {
        const myConfig = karma.config.mochaWebWorker || karma.config['mocha-webworker'] || {};
        let workerUrl;
        let mochaUrl;
        const userScriptUrls = [];
        const patterns = patternsFromConfig(myConfig.pattern);

        for (const url of Object.keys(karma.files)) {
                const sha = karma.files[url];
                const noCacheUrl = url + '?' + sha;

                if (/karma-mocha-webworker-client\/worker\.js$/.test(url)) {
                        workerUrl = noCacheUrl;
                }
                else if (/karma-mocha-webworker-client\/adapter\.js$/.test(url)) {
                        // noop, never match this script in a pattern
                }
                else if (/mocha\/mocha\.js$/.test(url)) {
                        mochaUrl = noCacheUrl;
                }
                else if (patterns.length) {
                        if (urlMatchesPatterns(patterns, url)) {
                                userScriptUrls.push(noCacheUrl);
                        }
                        else {
                                console.log('[karma-mocha-webworker] Skipping url because it does ' +
                                            'not match the given pattern(s)', url);
                        }
                }
                else { // no pattern(s) have been configured
                        userScriptUrls.push(noCacheUrl);
                }
        }

        if (!workerUrl) {
                throw Error('[karma-mocha-webworker] Unable to find url for worker.js in __karma__.files');
        }

        if (!mochaUrl) {
                throw Error('[karma-mocha-webworker] Unable to find url for mocha/mocha.js in __karma__.files');
        }

        const worker = new Worker(workerUrl);
        const rpc = new RPCWorker(worker);

        rpc.addNotifyMethods({
                ready() {
                        rpc.notify('importScripts', [mochaUrl]);
                        rpc.notify('initializeMocha', myConfig.mocha);
                        rpc.notify('importScripts', userScriptUrls);
                        rpc.notify('runMocha', karma.config.args);
                },

                karmaInfo(data) {
                        karma.info(data);
                },

                karmaComplete(data) {
                        karma.complete(data);
                },

                karmaResult(data) {
                        karma.result(data);
                }
        });

        worker.onmessage = e => rpc.handleMessage(e.data);
};
