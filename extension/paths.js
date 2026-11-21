'use strict';

const { getTools } = require('./bootstrap');

function runnerArgs(tools, source, snapshot, output, keepOpen = false) {
    if (tools.platform === 'darwin') {
        const args = [tools.runner, '--source', source, '--action', output ? 'Build' : 'Run'];
        if (snapshot) args.push('--snapshot', snapshot);
        if (output) args.push('--output', output);
        return args;
    }
    const args = ['-NoLogo', '-NoProfile'];
    if (output) args.push('-NonInteractive');
    else if (keepOpen) args.push('-NoExit');
    args.push('-ExecutionPolicy', 'RemoteSigned', '-File', tools.runner, '-Source', source, '-Action', output ? 'Build' : 'Run');
    if (snapshot) args.push('-Snapshot', snapshot);
    if (output) args.push('-Output', output);
    return args;
}

module.exports = { getTools, runnerArgs };
