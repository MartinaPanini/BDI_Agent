import { spawn } from 'child_process';

const host = "https://deliveroojs2.rtibdi.disi.unitn.it/";

const mexican = { id: 'bacab7', name: 'MexicanCaravan_1', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJhY2FiNyIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8xIiwidGVhbUlkIjoiMzE5MTg5IiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTY3fQ.rDBaXgmz05APYdv3Q4YrgvRSkuhOU-2_TIXxozF3He0' };
const caravan = { id: '19116b', name: 'MexicanCaravan_2', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE5MTE2YiIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8yIiwidGVhbUlkIjoiYWQxMWEzIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTcxfQ.PqdoYKx6jBWk8SqOtRrmPTACTrZu-hkCTWxAqI9M0wM' };

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
