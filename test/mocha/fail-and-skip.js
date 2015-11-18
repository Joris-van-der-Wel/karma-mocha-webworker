/* globals describe, it */
'use strict';

describe('karma-mocha-webworker', function() {
        it('should succeed', function() {
                console.log('Executed "should succeed"');
        });

        it('should fail', function() {
                throw Error('should fail');
        });

        it.skip('should be skipped', function() {
                throw Error('should have been skipped');
        });

        it('should be skipped', function() {
                this.skip();
                throw Error('should have been skipped');
        });

        it('there should be no global `window` object during tests', function(){
                if (typeof window !== 'undefined') {
                        throw Error('window should be undefined');
                }
        });
});
