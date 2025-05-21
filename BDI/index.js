// import child_process in ES module
import { spawn } from 'child_process';

export let multiAgent = true;
const host = 'http://localhost:8080';
// const host = 'https://deliveroojs2.rtibdi.disi.unitn.it/';
// const host = 'https://deliveroojs.rtibdi.disi.unitn.it/';
const mexican_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJhY2FiNyIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8xIiwidGVhbUlkIjoiMzE5MTg5IiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTY3fQ.rDBaXgmz05APYdv3Q4YrgvRSkuhOU-2_TIXxozF3He0'
const caravan_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE5MTE2YiIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8yIiwidGVhbUlkIjoiYWQxMWEzIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTcxfQ.PqdoYKx6jBWk8SqOtRrmPTACTrZu-hkCTWxAqI9M0wM'
const mexican_id = 'bacab7';
const caravan_id = '19116b';
if (multiAgent){
const mexican = { id: mexican_id, name: 'MexicanCaravan_1',
token: mexican_token
};

const caravan = { id: caravan_id, name: 'MexicanCaravan_2',
token: caravan_token
};
// Start the processes
spawnProcesses( mexican, caravan ); 
spawnProcesses( caravan, mexican ); 

// Function to spawn child processes
function spawnProcesses( me, teamMate ) {
    
    const childProcess = spawn(
        `node main \
        host="${host}" \
        token="${me.token}" \
        teamId="${teamMate.id}" `,
        { shell: true }
    );

    childProcess.stdout.on('data', data => {
        console.log(me.name, '>', data.toString());
    });

    childProcess.stderr.on('data', data => {
        console.error(me.name, '>', data.toString());
    });

    childProcess.on('close', code => {
        console.log(`${me.name}: exited with code ${code}`);
    });

};
}

if (!multiAgent){   
const mexican = { id: mexican_id, name: 'MexicanCaravan_1',
token: mexican_token
};
// Start the processes
spawnProcesses( mexican);

// Function to spawn child processes
function spawnProcesses( me ) {
    
    const childProcess = spawn(
        `node main \
        host="${host}" \
        token="${me.token}" `,
        { shell: true }
    );

};
}


