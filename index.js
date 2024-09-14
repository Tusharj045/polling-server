const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

// Data store
let users = [];
let questions = [];
let currentQuestion = null;
let currentVotes = {};
let questionTimeout = null;
let teacherConnected = false;

// Middleware for serving static files (e.g., frontend files)
app.use(express.static(__dirname + '/public'));

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Add user as teacher or student based on their selection
    socket.on('register', ({role, name}) => {
        console.log("ROLE on server side", role)
        if (role === 'teacher') {
            if (teacherConnected) {
                socket.emit('error', 'A teacher has already joined.');
            } else {
                teacherConnected = true;
                users.push({ id: socket.id, role: 'teacher' });
                socket.emit('registered', 'teacher');
                console.log(`Teacher registered with ID: ${socket.id}`);
            }
        } else if (role === 'student') {
            if (!teacherConnected) {
                socket.emit('error', 'A teacher has not joined yet.');
            } else {
                if (!name) {
                    socket.emit('registered', 'get_student_name')
                } else {
                    users.push({ id: socket.id, role: 'student', name: name });
                    socket.emit('registered', 'student');
                    console.log(`Student registered with ID: ${socket.id}, ${name}`);
                }
            }
        }
    });

    // Teacher asks a question
    socket.on('ask-question', (questionData) => {
        if (!teacherConnected || socket.id !== users.find(user => user.role === 'teacher').id) {
            socket.emit('error', 'Only the teacher can ask a question.');
            console.log('user not registered')
            return;
        }

        currentQuestion = {
            text: questionData.question,
            options: questionData.options.map( option => option.text),
            timeLimit: questionData.timeLimit
        };

        currentVotes = questionData.options.reduce((acc, option) => {
            acc[option.text] = 0;
            return acc;
        }, {});
        console.log(JSON.stringify(currentVotes), JSON.stringify(currentQuestion))

        io.emit('new-question', currentQuestion);

        // Start question timer
        if (questionTimeout) clearTimeout(questionTimeout);
        questionTimeout = setTimeout(() => {
            io.emit('time-up');
            currentQuestion = null;
        }, currentQuestion.timeLimit * 1000);

        console.log('Question asked:', currentQuestion);
    });

    // Student submits an answer
    socket.on('submit-answer', (answer) => {
        if (!currentQuestion) {
            socket.emit('error', 'No active question.');
            return;
        }

        if (!currentVotes.hasOwnProperty(answer)) {
            socket.emit('error', 'Invalid answer.');
            return;
        }

        currentVotes[answer]++;
        io.emit('update-votes', currentVotes);
        console.log('Answer submitted:', answer, 'Current votes:', currentVotes);
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        users = users.filter(user => user.id !== socket.id);

        if (teacherConnected && users.every(user => user.role !== 'teacher')) {
            teacherConnected = false;
            io.emit('teacher-disconnected');
            console.log('Teacher has disconnected. Waiting for a new teacher.');
        }
    });

    // Handle request for live vote updates
    socket.on('get-live-votes', () => {
        if (currentVotes) {
            socket.emit('update-votes', currentVotes);
        }
    });
});

// Start server
server.listen(3000, () => {
    console.log('Listening on *:3000');
});
