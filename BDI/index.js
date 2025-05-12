// import child_process in ES module
import { spawn } from 'child_process';

const mexican = { id: '648f16', name: 'mexican',
token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0OGYxNiIsIm5hbWUiOiJNZXhpY2FuIiwidGVhbUlkIjoiNGNkOTRiIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ2ODg1ODAxfQ.RqRiU7GdqLpwUafVeXOhg8uYS6gvItzOLqOKsSPvGw0'
};

const caravan = { id: 'df9fc5', name: 'caravan',
token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImRmOWZjNSIsIm5hbWUiOiJDYXJhdmFuIiwidGVhbUlkIjoiZDA2NjRmIiwidGVhbU5hbWUiOiJNZXhpY2FuQ2FyYXZhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ2ODg1ODA1fQ.zeMfm27npEBGF9Y7T7Jh9A767EGICJQdOkh4L40R3PY'
};

// Start the processes
spawnProcesses( mexican, caravan ); 
spawnProcesses( caravan, mexican ); 

// Function to spawn child processes
function spawnProcesses( me, teamMate ) {
    
    // marco e083aa6f59e
    const childProcess = spawn(
        `node main \
        host="https://deliveroojs.rtibdi.disi.unitn.it/" \
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


