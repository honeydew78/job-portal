const { validationResult } = require("express-validator");
const bcryptjs = require("bcryptjs");

const User = require("../models/user");
const Job = require("../models/job");
const Applicant = require("../models/applicant");
const { clearResume } = require("../util/helper");

exports.getStats = async (req, res, next) => {
  try {
    const providerCount = await User.countDocuments({ _id: { $ne: req.userId }, role: "Job Provider" });
    const seekerCount = await User.countDocuments({ _id: { $ne: req.userId }, role: "User" });
    const jobCount = await Job.countDocuments();
    const applicantCount = await Applicant.countDocuments();

    res.status(200).json({
      message: "Successfully fetched stats",
      stats: { jobCount, providerCount, applicantCount, seekerCount },
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getRecent = async (req, res, next) => {
  try {
    const recentUsers = await User.find({ _id: { $ne: req.userId } }).lean().sort({ createdAt: -1 }).limit(3);
    const recentJobs = await Job.find().lean().sort({ createdAt: -1 }).limit(3);

    res.status(200).json({
      message: "Successfully fetched recent stats",
      recentUsers,
      recentJobs,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }).lean();
    res.status(200).json({
      message: "Fetched the list of users",
      users: users,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.postUser = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  try {
    const hashedPw = await bcryptjs.hash(req.body.password, 12);
    const newUser = new User({ ...req.body, password: hashedPw });
    await newUser.save();
    res.status(201).json({ message: "User Added Successfully!" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getUser = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ message: "Fetched the user Successfully", user: user });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.editUser = async (req, res, next) => {
  const userId = req.params.userId;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  if (userId === req.userId) {
    const error = new Error("Cannot edit the current User");
    error.statusCode = 401;
    throw error;
  }

  try {
    const data = await User.findByIdAndUpdate(userId, req.body, { useFindAndModify: false });
    if (!data) {
      res.status(404).json({
        message: `Cannot update user with id=${userId}. Maybe user was not found!`,
      });
    } else {
      res.status(200).json({ message: "User was updated successfully." });
    }
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  const userId = req.params.userId;

  if (userId === req.userId) {
    const error = new Error("Cannot delete the current User");
    error.statusCode = 401;
    throw error;
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("Cannot delete user. User not found!");
      error.statusCode = 404;
      throw error;
    }

    const role = user.role;
    const jobs = role === "Job Provider" ? user.jobsPosted : [];

    await User.findByIdAndDelete(userId);

    if (role === "Job Provider") {
      await Job.deleteMany({ _id: { $in: jobs } });
    }

    const applicants = await Applicant.find(role === "Job Provider" ? { providerId: userId } : { userId: userId });
    const resumes = applicants.map(applicant => applicant.resume);

    await Applicant.deleteMany({ _id: { $in: applicants.map(applicant => applicant._id) } });
    resumes.forEach(resume => clearResume(resume));

    res.json({
      message: "User record was deleted successfully!",
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
    const jobs = await Job.find().lean();
    res.status(200).json({
      message: "Fetched the list of jobs",
      jobs: jobs,
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

  try {
    const newJob = new Job({ ...req.body, providerId: req.userId });
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
    const job = await Job.findById(jobId).lean();
    if (!job) {
      const error = new Error("Job not found");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ message: "Fetched the job Successfully", job: job });
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
    const data = await Job.findByIdAndUpdate(jobId, req.body, { useFindAndModify: false });
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
    const job = await Job.findById(jobId);
    if (!job) {
      const error = new Error("Cannot delete job. Job not found!");
      error.statusCode = 404;
      throw error;
    }

    const providerId = job.providerId;

    await Job.findByIdAndDelete(jobId);

    await User.findByIdAndUpdate(providerId, { $pull: { jobsPosted: jobId } });

    const applicants = await Applicant.find({ jobId: jobId });
    const resumes = applicants.map(applicant => applicant.resume);

    await Applicant.deleteMany({ _id: { $in: applicants.map(applicant => applicant._id) } });
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
