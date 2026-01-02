const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

// Initialize Google Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------------------------------------------------
// 1. REGISTER (Standard)
// ---------------------------------------------------------
router.post("/register", async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      yearOfAttendance,
      programmeTitle, // This comes from your dropdown
    } = req.body;

    // Check if email exists
    const emailExist = await User.findOne({ email: email });
    if (emailExist)
      return res.status(400).json({ message: "Email already registered." });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create User
    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
      phoneNumber,
      yearOfAttendance,
      programmeTitle,
      isVerified: true, // No Longer Pending Admin Approval
    });

    const savedUser = await newUser.save();
    res
      .status(201)
      .json({ message: "Registration successful!", userId: savedUser._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------
// 2. LOGIN (Standard)
// ---------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email });
    if (!user) return res.status(400).json({ message: "Email is not found." });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass)
      return res.status(400).json({ message: "Invalid Password." });

    if (user.isVerified === false) {
      return res
        .status(403)
        .json({ message: "Account pending approval. Please contact Admin." });
    }

    // ✅ UPDATE: Add 'canEdit' to the token payload
    const token = jwt.sign(
      {
        _id: user._id,
        isAdmin: user.isAdmin || false,
        canEdit: user.canEdit || false, // Include Edit Permission
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ UPDATE: Send 'canEdit' to frontend
    res.header("auth-token", token).json({
      token: token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isAdmin: user.isAdmin,
        canEdit: user.canEdit, // Send permission flag
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------
// 3. GOOGLE LOGIN (Hybrid Flow)
// ---------------------------------------------------------
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { name, email, picture } = ticket.getPayload();

    let user = await User.findOne({ email: email });

    if (user) {
      if (!user.isVerified)
        return res.status(403).json({ message: "Account pending approval." });

      // ✅ UPDATE: Add 'canEdit' to the token
      const authToken = jwt.sign(
        {
          _id: user._id,
          isAdmin: user.isAdmin || false,
          canEdit: user.canEdit || false,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      return res.json({
        message: "Login Success",
        token: authToken,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isAdmin: user.isAdmin,
          canEdit: user.canEdit, // ✅ Send permission flag
        },
      });
    } else {
      return res.status(404).json({
        message: "User not found",
        googleData: { fullName: name, email: email, photo: picture },
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Google Authentication Failed" });
  }
});

// ---------------------------------------------------------
// 4. FORGOT PASSWORD (LINK VERSION)
// ---------------------------------------------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ message: "Email not found" });

    // 1. Generate Secure Token
    const token = crypto.randomBytes(20).toString("hex");

    // 2. Save Token to Database
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // 3. Create the Reset Link (Using your Netlify Frontend)
    const resetUrl = `https://asconadmin.netlify.app/reset-password?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 4. Send HTML Email with Link
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "ASCON Connect - Password Reset",
      html: `
        <h3>Password Reset Request</h3>
        <p>Hello ${user.fullName},</p>
        <p>Please click the link below to reset your password:</p>
        <p>
           <a href="${resetUrl}" style="background-color: #1B5E3A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        </p>
        <p>Or copy this link into your browser:</p>
        <p>${resetUrl}</p>
        <p><i>This link expires in 1 hour.</i></p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Reset link sent to your email!" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Email could not be sent. Try again later." });
  }
});

// ---------------------------------------------------------
// 5. RESET PASSWORD (SECURE)
// ---------------------------------------------------------
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find user with this token AND check if valid
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Password reset link is invalid or has expired." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ message: "Password updated successfully! Please login." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
