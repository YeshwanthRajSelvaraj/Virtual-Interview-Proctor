const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const interviewId = req.body.interviewId || 'unknown';
    const timestamp = Date.now();
    cb(null, `${interviewId}-${timestamp}.webm`)
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory database (replaces MongoDB)
let interviews = [];
let nextId = 1;

// Routes

// Get all interviews
app.get('/api/interviews', async (req, res) => {
  try {
    res.json(interviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a specific interview
app.get('/api/interviews/:id', async (req, res) => {
  try {
    const interview = interviews.find(i => i.interviewId === req.params.id);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }
    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload video recording
app.post('/api/upload-recording', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const { interviewId } = req.body;
    if (!interviewId) {
      return res.status(400).json({ message: 'Interview ID is required' });
    }

    // Update interview with video recording info
    const interviewIndex = interviews.findIndex(i => i.interviewId === interviewId);
    if (interviewIndex === -1) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    interviews[interviewIndex].videoRecording = {
      path: req.file.path,
      size: req.file.size
    };

    res.json({ 
      message: 'Video uploaded successfully', 
      file: req.file 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new interview
app.post('/api/interviews', async (req, res) => {
  try {
    const { candidateName, interviewId } = req.body;
    
    const existingInterview = interviews.find(i => i.interviewId === interviewId);
    if (existingInterview) {
      return res.status(400).json({ message: 'Interview ID already exists' });
    }

    const interview = {
      id: nextId++,
      candidateName,
      interviewId,
      startTime: new Date(),
      status: 'in progress',
      focusLossCount: 0,
      faceAbsenceCount: 0,
      detectionEvents: [],
      integrityScore: 100
    };

    interviews.push(interview);
    res.status(201).json(interview);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update interview with final results
app.put('/api/interviews/:id', async (req, res) => {
  try {
    const { focusLossCount, faceAbsenceCount, detectionEvents, integrityScore, duration } = req.body;
    
    const interviewIndex = interviews.findIndex(i => i.interviewId === req.params.id);
    if (interviewIndex === -1) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    interviews[interviewIndex] = {
      ...interviews[interviewIndex],
      endTime: new Date(),
      status: 'completed',
      focusLossCount,
      faceAbsenceCount,
      detectionEvents,
      integrityScore,
      duration
    };

    res.json(interviews[interviewIndex]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Generate a proctoring report
app.get('/api/reports/:id', async (req, res) => {
  try {
    const interview = interviews.find(i => i.interviewId === req.params.id);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Calculate statistics
    const focusEvents = interview.detectionEvents.filter(e => 
      e.type === 'focus-loss' || e.type === 'face-absence'
    ).length;

    const objectEvents = interview.detectionEvents.filter(e => 
      e.type === 'object-detection'
    ).length;

    const multipleFacesEvents = interview.detectionEvents.filter(e => 
      e.type === 'multiple-faces'
    ).length;

    // Generate report data
    const report = {
      candidateName: interview.candidateName,
      interviewId: interview.interviewId,
      date: interview.startTime.toLocaleDateString(),
      duration: interview.duration,
      startTime: interview.startTime.toLocaleTimeString(),
      endTime: interview.endTime.toLocaleTimeString(),
      focusLossCount: interview.focusLossCount,
      faceAbsenceCount: interview.faceAbsenceCount,
      totalEvents: interview.detectionEvents.length,
      focusEvents,
      objectEvents,
      multipleFacesEvents,
      integrityScore: interview.integrityScore,
      events: interview.detectionEvents
    };

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export report as CSV
app.get('/api/reports/:id/csv', async (req, res) => {
  try {
    const interview = interviews.find(i => i.interviewId === req.params.id);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Create CSV content
    let csv = 'Time,Event Type,Severity,Details\n';
    interview.detectionEvents.forEach(event => {
      const time = event.timestamp.toLocaleTimeString();
      csv += `"${time}","${event.type}","${event.severity}","${event.message}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=proctoring-report-${interview.interviewId}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get statistics for dashboard
app.get('/api/stats/summary', async (req, res) => {
  try {
    const totalInterviews = interviews.length;
    const completedInterviews = interviews.filter(i => i.status === 'completed').length;
    
    const completedWithScore = interviews.filter(i => i.status === 'completed' && i.integrityScore);
    const avgIntegrityScore = completedWithScore.length > 0 
      ? completedWithScore.reduce((sum, i) => sum + i.integrityScore, 0) / completedWithScore.length 
      : 0;
    
    const recentInterviews = interviews
      .filter(i => i.status === 'completed')
      .sort((a, b) => new Date(b.endTime) - new Date(a.endTime))
      .slice(0, 5)
      .map(i => ({
        candidateName: i.candidateName,
        interviewId: i.interviewId,
        endTime: i.endTime,
        integrityScore: i.integrityScore
      }));

    res.json({
      totalInterviews,
      completedInterviews,
      avgIntegrityScore,
      recentInterviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle focus detection events
  socket.on('focus-event', (data) => {
    console.log('Focus event:', data);
    // Broadcast to all connected clients (including interviewer view)
    socket.broadcast.emit('focus-alert', data);
    
    // Save to database
    saveDetectionEvent(data.interviewId, data);
  });

  // Handle object detection events
  socket.on('object-detection', (data) => {
    console.log('Object detection:', data);
    socket.broadcast.emit('object-alert', data);
    
    // Save to database
    saveDetectionEvent(data.interviewId, data);
  });

  // Handle interview start
  socket.on('interview-start', (data) => {
    console.log('Interview started:', data);
    
    // Create a new interview record
    const interview = {
      id: nextId++,
      candidateName: data.candidateName,
      interviewId: data.interviewId,
      startTime: new Date(),
      status: 'in progress',
      focusLossCount: 0,
      faceAbsenceCount: 0,
      detectionEvents: [],
      integrityScore: 100
    };
    
    interviews.push(interview);
    console.log('Interview record created');
  });

  // Handle interview end
  socket.on('interview-end', (data) => {
    console.log('Interview ended:', data);
    
    // Update interview record
    const interviewIndex = interviews.findIndex(i => i.interviewId === data.interviewId);
    if (interviewIndex !== -1) {
      interviews[interviewIndex] = {
        ...interviews[interviewIndex],
        endTime: new Date(),
        status: 'completed',
        duration: data.duration,
        focusLossCount: data.focusLossCount,
        faceAbsenceCount: data.faceAbsenceCount,
        detectionEvents: data.detectionEvents,
        integrityScore: data.integrityScore
      };
      console.log('Interview record updated:', interviews[interviewIndex]);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Function to save detection events
function saveDetectionEvent(interviewId, eventData) {
  try {
    const interviewIndex = interviews.findIndex(i => i.interviewId === interviewId);
    if (interviewIndex !== -1) {
      interviews[interviewIndex].detectionEvents.push(eventData);
    }
  } catch (err) {
    console.error('Error saving detection event:', err);
  }
}

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
});