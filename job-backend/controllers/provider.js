const { validationResult } = require("express-validator");
const fs = require("fs");
const path = require("path");

const Job = require("../models/job");
const Applicant = require("../models/applicant");
const User = require("../models/user");

const { clearResume } = require("../util/helper");

exports.getStats = async (req, res, next) => {
  try {
    const jobsCount = await Job.countDocuments({ providerId: req.userId });
    const applicantsCount = await Applicant.countDocuments({ providerId: req.userId });

    res.status(200).json({
      message: "Successfully fetched the stats",
      stats: { jobsCount, applicantsCount },
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getRecents = async (req, res, next) => {
  try {
    const recentJobs = await Job.find({ providerId: req.userId }).sort({ createdAt: -1 }).limit(3).lean();

    res.status(200).json({
      message: "Successfully fetched the recent jobs",
      recentJobs,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getJobs = async (req, res, next) => {
  try {
    const jobs = await Job.find({ providerId: req.userId }).lean();

    res.status(200).json({
      message: "Fetched the list of jobs",
      jobs,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.addJob = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  const newJob = new Job({
    ...req.body,
    providerId: req.userId,
  });

  try {
    const job = await newJob.save();
    const user = await User.findById(req.userId);

    user.jobsPosted.push(job._id);
    await user.save();

    res.status(201).json({ message: "Job Added Successfully" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getJob = async (req, res, next) => {
  const jobId = req.params.jobId;

  try {
    const job = await Job.findOne({ _id: jobId, providerId: req.userId }).lean();

    if (!job) {
      const error = new Error("Job not found");
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({ message: "Fetched the job Successfully", job });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.editJob = async (req, res, next) => {
  const jobId = req.params.jobId;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  try {
    const data = await Job.findOneAndUpdate({ _id: jobId, providerId: req.userId }, req.body, {
      useFindAndModify: false,
    });

    if (!data) {
      res.status(404).json({
        message: `Cannot update job with id=${jobId}. Maybe job was not found!`,
      });
    } else {
      res.status(200).json({ message: "Job was updated successfully." });
    }
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.deleteJob = async (req, res, next) => {
  const jobId = req.params.jobId;

  try {
    const job = await Job.findOneAndDelete({ _id: jobId, providerId: req.userId });

    if (!job) {
      const error = new Error("Cannot delete job. Job not found!");
      error.statusCode = 404;
      throw error;
    }

    await User.findOneAndUpdate(
      { _id: req.userId },
      { $pull: { jobsPosted: jobId } }
    );

    const applicants = await Applicant.find({ jobId: jobId, providerId: req.userId });
    const resumes = applicants.map(applicant => applicant.resume);
    const applicantIds = applicants.map(applicant => applicant._id);

    await Applicant.deleteMany({ _id: { $in: applicantIds } });
    resumes.forEach(resume => clearResume(resume));

    res.json({
      message: "Job record was deleted successfully!",
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getApplicantsForJob = async (req, res, next) => {
  const jobId = req.params.jobId;
  const providerId = req.userId;

  try {
    const applicants = await Applicant.find({
      providerId,
      jobId,
      status: { $regex: "Applied", $options: "i" },
    })
    .populate("userId", "name")
    .lean();

    if (!applicants || applicants.length === 0) {
      return res.status(200).json({ message: "Looks like no one has applied yet!" });
    }

    res.status(200).json({
      message: "Successfully fetched the applicants",
      applicants,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getShortlistsForJob = async (req, res, next) => {
  const jobId = req.params.jobId;
  const providerId = req.userId;

  try {
    const shortlists = await Applicant.find({
      providerId,
      jobId,
      status: { $regex: "Shortlisted", $options: "i" },
    })
    .populate("userId", "name email")
    .lean();

    if (!shortlists || shortlists.length === 0) {
      return res.status(200).json({ message: "Looks like no one has been shortlisted yet!" });
    }

    res.status(200).json({
      message: "Successfully fetched the shortlists",
      shortlists,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getApplicantResume = async (req, res, next) => {
  const applicantId = req.params.applicantItemId;

  try {
    const applicant = await Applicant.findOne({ _id: applicantId, providerId: req.userId }).lean();

    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const resumeFile = applicant.resume;
    const resumePath = path.join(resumeFile);

    fs.readFile(resumePath, (err, data) => {
      if (err) {
        return next(err);
      }
      res.setHeader("Content-type", "application/pdf");
      res.send(data);
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.shortlistApplicant = async (req, res, next) => {
  const applicantItemId = req.params.applicantItemId;

  try {
    const applicant = await Applicant.findById(applicantItemId);

    if (!applicant) {
      return res.status(401).json({ message: "Applicant not found" });
    }

    if (applicant.providerId.toString() !== req.userId.toString()) {
      const error = new Error("You are unauthorized to do the action!");
      error.statusCode = 401;
      throw error;
    }

    if (applicant.status === "Shortlisted") {
      return res.status(409).json({ message: "Already shortlisted!" });
    }

    applicant.status = "Shortlisted";
    await applicant.save();

    res.status(200).json({ message: "Shortlisted the candidate!" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.rejectApplicant = async (req, res, next) => {
  const applicantItemId = req.params.applicantItemId;

  try {
    const applicant = await Applicant.findById(applicantItemId);

    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found!" });
    }

    if (req.userId.toString() !== applicant.providerId.toString()) {
      const error = new Error("You are unauthorized to do the action!");
      error.statusCode = 401;
      throw error;
    }

    clearResume(applicant.resume);
    await Applicant.findByIdAndDelete(applicantItemId);

    res.status(200).json({ message: "Applicant rejected successfully!" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};
