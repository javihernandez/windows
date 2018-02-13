# GPII Windows Service

A Windows Service that starts the GPII process (and listeners) when the user logs on, restarts it when it stops
unexpectedly, and provides the ability to run high-privileged tasks.

## Testing

The service can be ran as a normal process, without installing it.

```
node index.js
```

## Operation

### Command line options
```
 --install     Install the Windows Service.
 --serviceArgs=ARGS
         Comma separated arguments to pass to the service (use with --install).
 --uninstall   Uninstall the Windows Service.
 --service     Only used when running as a service.
 --config=FILE Specify the config file to use (default: service.json).
```

Should be ran as Administrator in order to manipulate services.

### Install the service

```
node service/index.js --install
```

This will make the service start when the computer restarts.

To verify the service has been installed: `sc qc gpii-service`

### Starting the service

```
sc start gpii-service
```

This will start the service, then start GPII.

### Stop the service:

```
sc stop gpii-service
```

This will stop GPII, then stop the service.

### Uninstall the service

After stopping the service...

```
node index.js --uninstall
```

(`sc delete gpii-service` also works, but `--uninstall` may perform additional work later)

## Logging

When the service is being ran as a Windows service, don't expect a console window. The log will be found in
`%ProgramData%\GPII\gpii-service.log` (`C:\ProgramData\GPII\gpii-service.log`). The service doesn't put the log in the
same directory as GPII, because that's in the directory belonging to a user profile and the server doesn't run as a
normal user.


## Configuration

### [service.json](config/service.json)

Production config, used when being ran as `gpii-service.exe`. Starts `./gpii-app.exe` and accepts a connection from only
that child process.

### [service.dev.json](config/service.dev.json)

Default development configuration, used when running the service from the source directory. This doesn't start a child
gpii process, but allows any process to connect to the pipe using a known name.

### [service.dev.child.json](config/service.dev.child.json)

Starts GPII, via `node ../gpii.js` and accepts a connection only that child process.


To specify the config file, use the `--config` option when running or installing the service.

### Config options

```javascript
{
    "processes": {
        /* A process block */
        "gpii": { // key doesn't matter
            /* The command to invoke. Can be undefined, to just open a pipe. */
            "command": "gpii-app.exe", // Starts gpii

            /* Provide a pipe to the process. */
            "ipc": "gpii", // The value will be used to determine internally what the pipe does (nothing special at the moment)

            /* Restart the process if it terminates. */
            "autoRestart": true,
        },
        
        /* Opens a pipe (\\.\pipe\gpii-gpii), without any authentication. */
        "gpii-dev": {
            "ipc": "gpii",
            "noAuth": true
        }

        /* More processes */
        "rfid-listener": {
            "command": "../listeners/GPII_RFIDListener.exe",
            "autoRestart": true
        },
        "usb-listener": {
            "command": "../listeners/GPII_USBListener.exe",
            "autoRestart": true
        }
    },
    "logging": {
        /* Log level: FATAL, ERROR, WARN, INFO, or DEBUG */
        "level": "DEBUG"
    }
}
```


## Installation

During the build process, gpii-app's Installer.ps1 will bundle the service into a
standalone executable, and the installer will put it in the same place as gpii-app.exe.

The installer will install and start the service.

## Notes

## How it works

Services are slightly different to normal processes, the differences are handled by
[stegru/node-os-service#GPII-2338](https://github.com/stegru/node-os-service/tree/GPII-2338), which is a fork of
[node-os-service](https://github.com/stephenwvickers/node-os-service), where the service-related calls are made.

The service is started by Windows during the start up, then waits for a user to log in. (By listening for the
[SERVICE_CONTROL_SESSIONCHANGE](https://msdn.microsoft.com/library/windows/desktop/ms683241.aspx)
service control code).

When a user logs on, it starts the processes listed in [service-config.json](service-config.json) as that user and will
restart them if they die.

## Debugging

When installing the service, add the debug arguments using the `--nodeArgs`. For example:

```
node index.js --install --nodeArgs=--inspect=0.0.0.0:1234,--debug-brk
sc start gpii-service
```

Then quickly attach to the service, before Windows thinks it didn't start.

## IPC

### Client authentication

Initial research in [GPII-2399](https://issues.gpii.net/browse/GPII-2399).

* Service creates pipe and listens
* Service starts Child, passing pipe name in `GPII_SERVICE_PIPE` environment variable.
    * pipe name isn't a secret - other processes see open pipes.
* Child connects to pipe
* Service creates an event
    * [CreateEvent](https://msdn.microsoft.com/library/ms682396) (unnamed, so only the handle can be used to access it)
    * [DuplicateHandle](https://msdn.microsoft.com/library/ms724251) creates another handle to the event that's tied to Child's process
* Service sends the Child's handle to the event through the pipe
    * The handle isn't a secret - it's a number that's meaningless to any process other than Child.
* Client calls [SetEvent](https://msdn.microsoft.com/library/ms686211) on the handle.
    * Only Child can signal that event
* Service detects the event's signal, access is granted.
