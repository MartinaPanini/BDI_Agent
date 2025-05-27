import { spawn } from 'child_process';

const host = "https://deliveroojs2.rtibdi.disi.unitn.it/";
//const host= "http://localhost:8080/"
const mexican = { id: 'a5b505', name: 'MC_1', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE1YjUwNSIsIm5hbWUiOiJNQ18xIiwidGVhbUlkIjoiMDE3YjFiIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ4MzQxNDU4fQ.BUltsYdCEaxEEhqj1VljF3iDHE21PAN7H-dZkYVzKK8' };
const caravan = { id: '9aa1d3', name: 'MC_2', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjlhYTFkMyIsIm5hbWUiOiJNQ18yIiwidGVhbUlkIjoiZTM4YjY0IiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ4MzQxNDYxfQ.JhUNNsbLuGcs81C4a3mbRVh6EOJ5HTahKj9__KQiv1I' };

const mode = process.argv[2]; // 'single' o 'multi'

if (mode === 'single') {
    console.log("✅ Start single-agent mode...\n");
    spawnProcesses(mexican, null);
} else if (mode === 'multi') {
    console.log("✅ Start multi-agent mode...\n");
    spawnProcesses(mexican, caravan);
    spawnProcesses(caravan, mexican);
} else {
    console.log("⚠️  Choose a mode: 'single' or 'multi'.");
    console.log("For example: node index.js multi");
    process.exit(1);
}

function spawnProcesses(me, teammate) {
    let cmd = `node main host="${host}" token="${me.token}"`;
    if (teammate) {
        cmd += ` teamId="${teammate.id}"`;
    }

    const childProcess = spawn(cmd, { shell: true });

    childProcess.stdout.on('data', data => {
        console.log(me.name, '>', data.toString());
    });

    childProcess.stderr.on('data', data => {
        console.error(me.name, '>', data.toString());
    });

    childProcess.on('close', code => {
        console.log(`${me.name}: exited with code ${code}`);
    });
}
