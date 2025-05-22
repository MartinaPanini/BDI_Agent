// import child_process in ES module
import { spawn } from 'child_process';

const mexican = { id: 'bacab7', name: 'MexicanCaravan_1',
token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJhY2FiNyIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8xIiwidGVhbUlkIjoiMzE5MTg5IiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTY3fQ.rDBaXgmz05APYdv3Q4YrgvRSkuhOU-2_TIXxozF3He0'
};

const caravan = { id: '19116b', name: 'MexicanCaravan_2',
token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE5MTE2YiIsIm5hbWUiOiJNZXhpY2FuQ2FyYXZhbl8yIiwidGVhbUlkIjoiYWQxMWEzIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ3NzQ0NTcxfQ.PqdoYKx6jBWk8SqOtRrmPTACTrZu-hkCTWxAqI9M0wM'
};

// Start the processes
spawnProcesses( mexican, caravan ); 
spawnProcesses( caravan, mexican ); 

// Function to spawn child processes
function spawnProcesses( me, teamMate ) {
    
    // marco e083aa6f59e
    const childProcess = spawn(
        `node main \
        host="http://localhost:8080" \
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