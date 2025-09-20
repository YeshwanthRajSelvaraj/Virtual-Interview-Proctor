const express = require('express');
const Interview = require('../models/Interview');
const router = express.Router();

// Generate a proctoring report
router.get('/:id', async (req, res) => {
  try {
    const interview = await Interview.findOne({ interviewId: req.params.id });
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
router.get('/:id/csv', async (req, res) => {
  try {
    const interview = await Interview.findOne({ interviewId: req.params.id });
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
router.get('/stats/summary', async (req, res) => {
  try {
    const totalInterviews = await Interview.countDocuments();
    const completedInterviews = await Interview.countDocuments({ status: 'completed' });
    const avgIntegrityScore = await Interview.aggregate([
      { $match: { status: 'completed', integrityScore: { $exists: true } } },
      { $group: { _id: null, avgScore: { $avg: '$integrityScore' } } }
    ]);
    
    const recentInterviews = await Interview.find({ status: 'completed' })
      .sort({ endTime: -1 })
      .limit(5)
      .select('candidateName interviewId endTime integrityScore');

    res.json({
      totalInterviews,
      completedInterviews,
      avgIntegrityScore: avgIntegrityScore[0]?.avgScore || 0,
      recentInterviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;