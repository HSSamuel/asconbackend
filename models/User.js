const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    min: 6,
    max: 255,
  },
  email: {
    type: String,
    required: true,
    max: 255,
    min: 6,
  },
  password: {
    type: String,
    required: true,
    max: 1024,
    min: 6,
  },
  phoneNumber: {
    type: String,
    required: true,
  },

  // ✅ UPDATED: Stores the selected course from the Dropdown
  programmeTitle: {
    type: String,
    required: false, // Changed to false to prevent update crashes
  },

  // ✅ NEW FIELD: For "Other" option in dropdown
  customProgramme: {
    type: String,
    default: "",
  },

  yearOfAttendance: {
    type: Number,
    required: false, // ✅ CRITICAL FIX: Must be false to handle empty updates safely
  },

  // Professional Details
  jobTitle: { type: String, default: "" },
  organization: { type: String, default: "" },

  // ✅ NEW MISSING FIELDS (Required for Profile Update)
  bio: { type: String, default: "" },
  linkedin: { type: String, default: "" },

  // Admin & Security Fields
  isAdmin: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: true },
  canEdit: { type: Boolean, default: false },

  // Profile Picture
  profilePicture: { type: String, default: "" },

  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
