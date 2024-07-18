const Job = require("../models/job");
const Applicant = require("../models/applicant");

const { clearResume } = require("../util/helper");
const { dateFormatter } = require("../util/helper");

exports.getAvailableJobs = async (req, res, next) => {
  try {
    const applicants = await Applicant.find({ userId: req.userId }).lean();
    const appliedJobs = applicants.map(applicant => applicant.jobId);

    const jobs = await Job.find({ _id: { $nin: appliedJobs } }).lean();

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

exports.getAppliedJobs = async (req, res, next) => {
  try {
    const applicants = await Applicant.find({ userId: req.userId }).lean();

    const appliedJobs = applicants.map(applicant => applicant.jobId);
    const statusMap = new Map(applicants.map(applicant => [applicant.jobId.toString(), applicant.status]));

    const jobsApplied = await Job.find({ _id: { $in: appliedJobs } }).lean();

    jobsApplied.forEach(job => {
      job.status = statusMap.get(job._id.toString());
    });

    res.status(200).json({
      message: "Fetched the list of jobs",
      jobsApplied: jobsApplied,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.applyJob = async (req, res, next) => {
  if (!req.file) {
    const err = new Error("Resume not Found");
    err.statusCode = 422;
    throw err;
  }

  const jobId = req.params.jobId;
  const userId = req.userId;
  const providerId = req.body.providerId;
  const resume = req.file.path.replace("\\", "/");
  const status = "Applied on " + dateFormatter();

  try {
    const existingApplicant = await Applicant.findOne({ jobId, userId });

    if (existingApplicant) {
      clearResume(resume);
      return res.status(409).json({ message: "You have already applied for the job!" });
    }

    const newApplicant = new Applicant({
      jobId,
      userId,
      resume,
      status,
      providerId,
    });

    await newApplicant.save();

    res.status(201).json({ message: "Successfully applied for the job!" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};
