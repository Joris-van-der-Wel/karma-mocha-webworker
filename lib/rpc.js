'use strict';

function argsToArray() { // (avoid a deopt)
        /* jshint -W040 */
        const start = this || 0;
        const ret = new Array(arguments.length - start);

        for (let i = start; i < arguments.length; ++i) {
                ret[i - start] = arguments[i];
        }

        return ret;
}

class WorkerRPC {
        constructor(target) {
                this.target = target;
                this.methods = Object.create(null);
                target.onmessage = e => this.handleMessage(e.data);
        }

        notify(method, param) {
                const msg = {
                        jsonrpc : '2.0',
                        method  : method
                };

                if (arguments.length > 1) {
                        msg.params = argsToArray.apply(1, arguments);
                }

                this.target.postMessage(msg);
        }

        addNotifyMethods(methods) {
                Object.keys(methods).forEach(name => this.methods[name] = methods[name]);
        }

        handleMessage(data) {
                const messages = Array.isArray(data) ? data : [data];
                const results = [];
                const notificationErrors = [];

                messages.forEach(msg => {
                        if ('id' in msg) {
                                results.push({
                                        jsonrpc : '2.0',
                                        id      : msg.id,
                                        error   : {
                                                code    : -32601,
                                                message : 'Not supported'
                                        }
                                });
                        }
                        else {
                                try {
                                        this.methods[msg.method].apply(msg.id, msg.params || []);
                                }
                                catch (err) {
                                        notificationErrors.push(err);
                                }
                        }
                });

                if (Array.isArray(data)) {
                        this.target.postMessage(results);
                }
                else if (results[0]) {
                        this.target.postMessage(results[0]);
                }

                if (notificationErrors.length === 1) {
                        throw notificationErrors[0];
                }
                else if (notificationErrors.length > 1) {
                        const err = Error('One or more exceptions while handling notification calls');
                        err.detail = notificationErrors;
                        throw err;
                }
        }
}

module.exports = WorkerRPC;
