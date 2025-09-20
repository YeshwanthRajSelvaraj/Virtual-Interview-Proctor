const express = require('express');
const multer = require('multer');
const Interview = require('../models/Interview');
const router = express.Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Save with interview ID and timestamp
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

// Get all interviews
router.get('/interviews', async (req, res) => {
  try {
    const interviews = await Interview.find().sort({ createdAt: -1 });
    res.json(interviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a specific interview
router.get('/interviews/:id', async (req, res) => {
  try {
    const interview = await Interview.findOne({ interviewId: req.params.id });
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }
    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload video recording
router.post('/upload-recording', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const { interviewId } = req.body;
    if (!interviewId) {
      return res.status(400).json({ message: 'Interview ID is required' });
    }

    // Update interview with video recording info
    const interview = await Interview.findOneAndUpdate(
      { interviewId: interviewId },
      { 
        videoRecording: {
          path: req.file.path,
          size: req.file.size
        }
      },
      { new: true }
    );

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    res.json({ 
      message: 'Video uploaded successfully', 
      file: req.file 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new interview
router.post('/interviews', async (req, res) => {
  try {
    const { candidateName, interviewId } = req.body;
    
    const existingInterview = await Interview.findOne({ interviewId });
    if (existingInterview) {
      return res.status(400).json({ message: 'Interview ID already exists' });
    }

    const interview = new Interview({
      candidateName,
      interviewId,
      startTime: new Date(),
      status: 'in progress'
    });

    const savedInterview = await interview.save();
    res.status(201).json(savedInterview);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update interview with final results
router.put('/interviews/:id', async (req, res) => {
  try {
    const { focusLossCount, faceAbsenceCount, detectionEvents, integrityScore, duration } = req.body;
    
    const interview = await Interview.findOneAndUpdate(
      { interviewId: req.params.id },
      { 
        endTime: new Date(),
        status: 'completed',
        focusLossCount,
        faceAbsenceCount,
        detectionEvents,
        integrityScore,
        duration
      },
      { new: true }
    );

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    res.json(interview);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;