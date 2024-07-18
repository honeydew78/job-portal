const bcryptjs = require("bcryptjs");
const { validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");

const User = require("../models/user");

exports.signup = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  try {
    const password = req.body.password;
    const hashedPw = await bcryptjs.hash(password, 12);

    const newUser = new User({ ...req.body, password: hashedPw });
    await newUser.save();

    res.status(201).json({ message: "Registered Successfully!" });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation Failed");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  const email = req.body.email;
  const password = req.body.password;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      const error = new Error("Email does not exist");
      error.statusCode = 401;
      throw error;
    }

    const isEqual = await bcryptjs.compare(password, user.password);

    if (!isEqual) {
      const error = new Error("Incorrect Password");
      error.statusCode = 401;
      throw error;
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        userName: user.name,
        role: user.role,
      },
      "thisistooconfidential",
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login Successful",
      token,
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};
