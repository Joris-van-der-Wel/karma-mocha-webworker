'use strict';

const {deepStrictEqual} = require('assert');
const {Server} = require('karma');

const run = (configFile, expectedBrowserResult) => new Promise(resolve => {
        const results = [];

        const done = () => {
                console.log(`[karma-mocha-webworker] [${configFile}] Karma has completed all browser runs`);

                let failures = 0;

                for (const result of results) {
                        try {
                                deepStrictEqual(result.browserResult, expectedBrowserResult);
                        }
                        catch (error) {
                                // continue on with the other tests
                                console.error(`[karma-mocha-webworker] [${configFile}] [${result.browserName}]`, error);
                                ++failures;
                        }
                }

                resolve({results, failures});
        };

        const server = new Server({configFile: require.resolve(configFile)}, done);

        server.on('browser_complete_with_no_more_retries', (completedBrowser) => {
                const browserName = completedBrowser.name;
                console.log(`[karma-mocha-webworker] [${configFile}] Browser "${browserName}" has completed its run`);

                const {lastResult} = completedBrowser;

                results.push({
                        browserName: browserName,
                        browserResult: {
                                success: lastResult.success,
                                failed: lastResult.failed,
                                skipped: lastResult.skipped,
                                total: lastResult.total,
                                error: lastResult.error,
                                disconnected: lastResult.disconnected,
                        },
                });
        });

        server.start();
});

const runs = [
        ['./defaults.conf.js', {success: 1, failed: 0, skipped: 0, total: 1, error: false, disconnected: false}],
        ['./fail-and-skip.conf.js', {success: 2, failed: 1, skipped: 2, total: 5, error: false, disconnected: false}],
        ['./grep.conf.js', {success: 1, failed: 0, skipped: 0, total: 1, error: false, disconnected: false}],
        ['./mocha-options.conf.js', {success: 1, failed: 0, skipped: 0, total: 1, error: false, disconnected: false}],
        ['./with-evaluate.conf.js', {success: 2, failed: 0, skipped: 0, total: 2, error: false, disconnected: false}],
        ['./with-pattern.conf.js', {success: 1, failed: 0, skipped: 0, total: 1, error: false, disconnected: false}],
];

runs.reduce(
        (promise, [configFile, expectedBrowserResult]) => promise
                .then(totalFailures => run(configFile, expectedBrowserResult).then(result => totalFailures + result.failures)
        ),
        Promise.resolve(0)
)
.then(totalFailures => {
        console.log();
        console.log();
        console.log(`[karma-mocha-webworker] All runs with all config files have been completed`);
        console.log(`[karma-mocha-webworker] There were a total of ${totalFailures} failures`);

        if (totalFailures > 0) {
                process.exitCode = 2;
        }
});
