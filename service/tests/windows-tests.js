/* Tests for windows.js
 *
 * Copyright 2017 Raising the Floor - International
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this License.
 *
 * The R&D leading to these results received funding from the
 * Department of Education - Grant H421A150005 (GPII-APCP). However,
 * these results do not necessarily represent the policy of the
 * Department of Education, and you should not assume endorsement by the
 * Federal Government.
 *
 * You may obtain a copy of the License at
 * https://github.com/GPII/universal/blob/master/LICENSE.txt
 */

"use strict";

var jqUnit = require("node-jqunit"),
    child_process = require("child_process"),
    path = require("path"),
    windows = require("../src/windows.js");

var winapi = windows.winapi;

var windowsTests = {
    testData: {}
};
var teardowns = [];

jqUnit.module("GPII Windows tests", {
    teardown: function () {
        while (teardowns.length) {
            teardowns.pop()();
        }
    }
});

windowsTests.testData.waitForProcessTerminationFailures = [
    { input: -1 }, // Non-running pid
    { input: 0 },  // Invalid (System Idle Process)
    { input: null },
    { input: "not a pid" }
];

windowsTests.testData.waitForMultipleObjects = [
    {
        // single
        input: {
            count: 1, // number of handles
            all: false,
            signal: [ 0 ] // which ones to signal
        },
        expect: 0 // the resolve value
    },
    {
        // single - not signalled
        input: {
            count: 1,
            all: false,
            signal: [ ]
        },
        expect: "timeout"
    },
    {
        // multiple
        input: {
            count: 3,
            all: false,
            signal: [ 0 ]
        },
        expect: 0
    },
    {
        // not the first.
        input: {
            count: 3,
            all: false,
            signal: [ 1 ]
        },
        expect: 1
    },
    // MSDN: "If multiple objects become signaled, the function returns the index of the first handle in the array
    // whose object was signaled"
    {
        // more than one signalled
        input: {
            count: 3,
            all: false,
            signal: [ 0, 2 ]
        },
        expect: 0
    },
    {
        // more than one signalled - reverse order
        input: {
            count: 3,
            all: false,
            signal: [ 2, 1 ]
        },
        // The wait thread may execute in between the SetEvent calls.
        expect: [ 2, 1 ]
    },
    {
        // none signalled
        input: {
            count: 3,
            all: false,
            signal: [ ]
        },
        expect: "timeout"
    },
    {
        // wait for all (single)
        input: {
            count: 1,
            all: true,
            signal: [ 0 ]
        },
        expect: 0
    },
    {
        // wait for all (multiple)
        input: {
            count: 3,
            all: true,
            signal: [ 0, 1, 2 ]
        },
        expect: 0
    },
    {
        // some signalled
        input: {
            count: 3,
            all: true,
            signal: [ 1, 2 ]
        },
        expect: "timeout"
    },
    {
        // none signalled
        input: {
            count: 3,
            all: true,
            signal: [  ]
        },
        expect: "timeout"
    }
];

windowsTests.testData.waitForMultipleObjectsFailures = [
    // Non-arrays
    { input: null },
    { input: [] },
    { input: "not an array" },
    { input: 1 },
    // Invalid handles
    { input: [ 0 ] },
    { input: [ 0, 0 ] },
    { input: [ -1 ] },
    { input: [ -1, -1 ] },
    { input: [ winapi.constants.INVALID_HANDLE_VALUE ] },
    { input: [ winapi.constants.INVALID_HANDLE_VALUE, winapi.constants.INVALID_HANDLE_VALUE ] }
];

/**
 * Returns true if value looks like a promise.
 *
 * @param {Object} value The thing to test.
 * @return {Boolean} true if value is a promise.
 */
windowsTests.isPromise = function (value) {
    return value && typeof(value.then) === "function";
};

jqUnit.test("Test isService", function () {
    // Only half tested here.
    var isService = windows.isService();
    jqUnit.assertFalse("This process isn't a service", isService);
});

jqUnit.test("Test getOwnUserToken", function () {
    var userToken = windows.getOwnUserToken();
    teardowns.push(function () {
        windows.closeToken(userToken);
    });

    jqUnit.assertTrue("userToken should be something", !!userToken);
    jqUnit.assertFalse("userToken should be numeric", isNaN(userToken));
    // The validity of the token will be tested via execute/startProcess in gpii-ipc-tests.js
});

jqUnit.test("Test getDesktopUser", function () {
    var userToken = windows.getDesktopUser();
    teardowns.push(function () {
        windows.closeToken(userToken);
    });

    jqUnit.assertTrue("desktop userToken should be something", !!userToken);
    jqUnit.assertFalse("desktop userToken should be numeric", isNaN(userToken));
    // The validity of the token will be tested via execute/startProcess in gpii-ipc-tests.js
});

jqUnit.test("Test isUserLoggedOn", function () {
    var loggedOn = windows.isUserLoggedOn();

    jqUnit.assertTrue("User should be detected as being logged on", loggedOn);
});

jqUnit.test("Test isUserLoggedOn", function () {
    var loggedOn = windows.isUserLoggedOn();

    jqUnit.assertTrue("User should be detected as being logged on", loggedOn);
});

jqUnit.test("Test getEnv", function () {
    var userToken = windows.getOwnUserToken();

    var env = windows.getEnv(userToken);

    jqUnit.assertTrue("returned env should be something", !!env);
    jqUnit.assertTrue("env should be an array", Array.isArray(env));

    for (var envIndex = 0; envIndex < env.length; envIndex++) {
        var item = env[envIndex];
        jqUnit.assertEquals("env elements must be strings", "string", typeof(item));
        jqUnit.assertTrue("env elements must be like 'name=value'", !!item.match(/^[^=]+=/));
    }

    // The environment block returned is the initial environment, so comparing it against this process's isn't possible.
    // Make sure it looks valid by just checking a few items which will probably be static.
    var expected = [
        "Username",
        "SystemRoot",
        "UserProfile"
    ];

    for (var expectedIndex = 0, len = expected.length; expectedIndex < len; expectedIndex++) {
        var name = expected[expectedIndex];
        var find = (name + "=" + process.env[name]).toLowerCase();

        // it's only a small loop in a test.
        // eslint-disable-next-line no-loop-func
        var found = env.some(function (value) {
            return value.toLowerCase() === find;
        });

        jqUnit.assertTrue(name + " should have been in the environment", found);
    }
});

jqUnit.asyncTest("Test waitForProcessTermination", function () {
    jqUnit.expect(7);

    // Test it with or without timing out.
    var runTest = function (testTimeout) {
        // Create a short-running process.
        var exe = path.join(process.env.SystemRoot, "/System32/waitfor.exe");
        var command = exe + " waitForProcessTerminationTest /T 5 > nul";
        var child = child_process.exec(command);

        var timeout = testTimeout ? 100 : 2000;
        var promise = windows.waitForProcessTermination(child.pid, timeout);

        jqUnit.assertTrue("waitForProcessTermination must return a promise", windowsTests.isPromise(promise));

        var killed = false;
        promise.then(function (value) {
            jqUnit.assert("promise resolved");

            if (testTimeout) {
                jqUnit.assertEquals("waitForProcessTermination should have timed out", "timeout", value);
                process.kill(child.pid);
                jqUnit.start();
            } else {
                jqUnit.assertNotEquals("waitForProcessTermination should not have timed out", "timeout", value);
                jqUnit.assertTrue("waitForProcessTermination should not resolve before the process is killed", killed);

                // Test again, but expect a timeout
                runTest(true);
            }
        }, jqUnit.fail);

        if (!testTimeout) {
            process.nextTick(function () {
                killed = true;
                process.kill(child.pid);
            });
        }
    };

    runTest(false);
});

jqUnit.asyncTest("Test waitForProcessTermination failure", function () {

    var testData = windowsTests.testData.waitForProcessTerminationFailures;

    jqUnit.expect(testData.length * 4);

    var runTest = function (testIndex) {
        if (testIndex >= testData.length) {
            jqUnit.start();
            return;
        }
        var suffix = ": testIndex=" + testIndex;
        var promise = windows.waitForProcessTermination(testData[testIndex].input, 200);

        jqUnit.assertTrue("waitForProcessTermination must return a promise" + suffix, windowsTests.isPromise(promise));

        promise.then(function () {
            jqUnit.fail("waitForProcessTermination should not have resolved" + suffix);
        }, function (e) {
            jqUnit.assert("waitForProcessTermination should have rejected" + suffix);
            jqUnit.assertTrue("waitForProcessTermination should have rejected with a value" + suffix, !!e);
            jqUnit.assertTrue("waitForProcessTermination should have rejected with an error" + suffix,
                e instanceof Error || e.isError);
            runTest(testIndex + 1);
        });

    };

    runTest(0);
});

jqUnit.asyncTest("Test waitForMultipleObjects", function () {

    var testData = windowsTests.testData.waitForMultipleObjects;
    jqUnit.expect(testData.length * 2);

    var allHandles = [];
    teardowns.push(function () {
        allHandles.forEach(function (handle) {
            winapi.kernel32.CloseHandle(handle);
        });
    });

    var runTest = function (testIndex) {
        if (testIndex >= testData.length) {
            jqUnit.start();
            return;
        }

        var test = testData[testIndex];

        // Create the events.
        var handles = [];
        for (var n = 0; n < test.input.count; n++) {
            handles.push(winapi.kernel32.CreateEventW(winapi.NULL, false, false, winapi.NULL));
        }
        allHandles.push.apply(allHandles, handles);

        var promise = windows.waitForMultipleObjects(handles, 100, test.input.all);

        jqUnit.assertTrue("waitForMultipleObjects must return a promise", windowsTests.isPromise(promise));

        var messageSuffix = " - testIndex=" + testIndex;
        var expected = isNaN(test.expect) ? test.expect : handles[test.expect];
        promise.then(function (value) {
            if (Array.isArray(test.expect)) {
                var found = test.expect.indexOf(value);
                jqUnit.assertTrue("waitForMultipleObjects must resolve with an expected value" + messageSuffix, found);
            } else {
                jqUnit.assertEquals("waitForMultipleObjects must resolve with the expected value" + messageSuffix,
                    expected, value);
            }
            // Run the next test.
            runTest(testIndex + 1);
        }, jqUnit.fail);

        // Signal some events.
        test.input.signal.forEach(function (index) {
            winapi.kernel32.SetEvent(handles[index]);
        });

    };

    runTest(0);
});

jqUnit.asyncTest("Test waitForMultipleObjects failures", function () {
    var testData = windowsTests.testData.waitForMultipleObjectsFailures;
    jqUnit.expect(testData.length * 4);

    var runTest = function (testIndex) {
        if (testIndex >= testData.length) {
            jqUnit.start();
            return;
        }

        var test = testData[testIndex];

        var promise = windows.waitForMultipleObjects(test.input, 100, false);

        var messageSuffix = " - testIndex=" + testIndex;
        jqUnit.assertTrue("waitForMultipleObjects must return a promise" + messageSuffix,
            windowsTests.isPromise(promise));

        promise.then(function () {
            jqUnit.fail("waitForMultipleObjects should not have resolved" + messageSuffix);
        }, function (e) {
            jqUnit.assert("waitForMultipleObjects should have rejected" + messageSuffix);
            jqUnit.assertTrue("waitForMultipleObjects should have rejected with a value" + messageSuffix, !!e);
            jqUnit.assertTrue("waitForMultipleObjects should have rejected with an error" + messageSuffix,
                e instanceof Error || e.isError);
            runTest(testIndex + 1);
        });

    };

    runTest(0);
});

// Tests waitForMultipleObjects with a process, since that's mainly what waitForMultipleObjects will be used for.
jqUnit.asyncTest("Test waitForMultipleObjects with a process", function () {
    jqUnit.expect(6);

    var runTest = function (testTimeout) {

        var exe = path.join(process.env.SystemRoot, "/System32/waitfor.exe");
        var command = exe + " waitForMultipleObjectsTest /T 5 > nul";
        var child = child_process.exec(command);

        var hProcess = winapi.kernel32.OpenProcess(winapi.constants.SYNCHRONIZE, 0, child.pid);
        if (hProcess === winapi.NULL) {
            jqUnit.fail(windows.win32Error("OpenProcess"));
            return;
        }

        teardowns.push(function () {
            winapi.kernel32.CloseHandle(hProcess);
        });

        var timeout = testTimeout ? 100 : 2000;
        var promise = windows.waitForMultipleObjects([hProcess], timeout, false);

        jqUnit.assertTrue("waitForMultipleObjects must return a promise", windowsTests.isPromise(promise));

        var killed = false;
        promise.then(function (value) {
            if (testTimeout) {
                jqUnit.assertEquals("waitForMultipleObjects should have timed out", "timeout", value);
                process.kill(child.pid);
                jqUnit.start();
            } else {
                jqUnit.assertNotEquals("waitForMultipleObjects should not have timed out", "timeout", value);
                jqUnit.assertTrue("waitForMultipleObjects should not resolve before the process is killed", killed);
                jqUnit.assertEquals("waitForMultipleObjects should resolve with the process handle", hProcess, value);

                // Test again, but expect a timeout
                runTest(true);
            }

        }, jqUnit.fail);

        if (!testTimeout) {
            killed = true;
            child.kill();
        }
    };

    runTest(false);
});
