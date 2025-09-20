const mongoose = require('mongoose');

const detectionEventSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['focus-loss', 'face-absence', 'multiple-faces', 'object-detection']
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['warning', 'danger']
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: {
    // Additional details about the event
    objectType: String, // For object detection
    duration: Number    // For focus loss/absence events
  }
});

const interviewSchema = new mongoose.Schema({
  candidateName: {
    type: String,
    required: true
  },
  interviewId: {
    type: String,
    required: true,
    unique: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number // in seconds
  },
  status: {
    type: String,
    enum: ['scheduled', 'in progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  focusLossCount: {
    type: Number,
    default: 0
  },
  faceAbsenceCount: {
    type: Number,
    default: 0
  },
  detectionEvents: [detectionEventSchema],
  integrityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  videoRecording: {
    path: String,
    size: Number
  }
}, {
  timestamps: true
});

// Calculate duration before saving
interviewSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / 1000);
  }
  next();
});

module.exports = mongoose.model('Interview', interviewSchema);