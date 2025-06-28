const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// MongoDB Connection
mongoose
  .connect("mongodb://localhost:27017/fullstack-auth", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Models
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}));

const Admin = mongoose.model("Admin", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}));

const Complaint = mongoose.model("Complaint", new mongoose.Schema({
  username: { type: String, required: true },
  complaintText: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  subLocation: { type: String },
  roomNo: { type: String },
  image: {
    data: Buffer,
    contentType: String,
  },
  status: { type: String, default: "Yet to Begin" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true }));

const statusSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", required: true },
  complaintText: { type: String, required: true },
  location: { type: String, required: true },
  subLocation: { type: String },
  status: { type: String, enum: ["Yet to Begin", "In Progress", "Resolved"], required: true },
  updatedAt: { type: Date, default: Date.now },
});

const Status = mongoose.model("Status", statusSchema);

const Event = mongoose.model("Event", new mongoose.Schema({
  date: { type: String, required: true },
  department: { type: String, required: true },
  title: { type: String, required: true },
  venue: { type: String, required: true },
  time: { type: String, required: true },
  timePeriod: { type: String, enum: ["AM", "PM"], required: true },
  description: { type: String },
}, { timestamps: true }));

const Feedback = mongoose.model("Feedback", new mongoose.Schema({
  date: { type: String, required: true },
  description: { type: String, required: true },
  rating: { type: Number, required: true },
}, { timestamps: true }));

// User Routes
app.post("/user/signup", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        error: existingUser.email === email ? "Email already registered" : "Username already taken",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User signup successful!" });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

app.post("/user/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.status(200).json({ message: "Login successful!" });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// Admin Routes
app.post("/admin/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!email.endsWith("@admin.com")) {
      return res.status(400).json({ error: "Email must end with @admin.com" });
    }

    const existingAdmin = await Admin.findOne({ $or: [{ email }, { username }] });
    if (existingAdmin) {
      return res.status(400).json({
        error: existingAdmin.email === email ? "Email already registered" : "Username already taken",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, email, password: hashedPassword });
    await newAdmin.save();

    res.status(201).json({ message: "Admin signup successful!" });
  } catch (error) {
    console.error("Admin Signup Error:", error);
    res.status(500).json({ error: "Admin signup failed. Please try again." });
  }
});

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: "Invalid username" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.status(200).json({ message: "Admin login successful!" });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// Complaint Routes
app.post("/submit-complaint", upload.single("image"), async (req, res) => {
  try {
    const { username, complaintText, date, location, subLocation, roomNo } = req.body;

    const complaint = new Complaint({
      username,
      complaintText,
      date,
      location,
      subLocation,
      roomNo: location === "mess" || location === "garden" ? null : roomNo,
    });

    if (req.file) {
      complaint.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
    }

    await complaint.save();

    const initialStatus = new Status({
      complaintId: complaint._id,
      complaintText: complaint.complaintText,
      location: complaint.location,
      subLocation: complaint.subLocation,
      status: "Yet to Begin",
    });
    await initialStatus.save();

    res.status(201).json({ message: "Complaint submitted successfully!" });
  } catch (error) {
    console.error("Complaint Submission Error:", error);
    res.status(500).json({ error: "Failed to submit complaint" });
  }
});

app.get("/get-complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find();
    const complaintsWithImages = complaints.map((complaint) => {
      if (complaint.image && complaint.image.data) {
        const base64Image = complaint.image.data.toString("base64");
        return {
          ...complaint._doc,
          image: `data:${complaint.image.contentType};base64,${base64Image}`,
        };
      }
      return { ...complaint._doc, image: null };
    });

    res.status(200).json(complaintsWithImages);
  } catch (error) {
    console.error("Fetch Complaints Error:", error);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

// Status Routes
app.post("/update-status/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { status } = req.body;

    const complaint = await Complaint.findOne({ date: new Date(date) });
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    complaint.status = status;
    complaint.updatedAt = new Date();
    await complaint.save();

    const newStatus = new Status({
      complaintId: complaint._id,
      complaintText: complaint.complaintText,
      location: complaint.location,
      subLocation: complaint.subLocation,
      status,
      updatedAt: new Date(),
    });
    await newStatus.save();

    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    console.error("Status Update Error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

app.get("/get-status", async (req, res) => {
  try {
    const statuses = await Status.find().populate("complaintId", "complaintText location subLocation");
    res.json(statuses);
  } catch (error) {
    console.error("Fetch Status Error:", error);
    res.status(500).json({ message: "Error fetching status data" });
  }
});

// Event Routes
app.post("/admin/post-event", async (req, res) => {
  try {
    const { date, department, title, venue, time, timePeriod, description } = req.body;
    const event = new Event({
      date,
      department,
      title,
      venue,
      time,
      timePeriod,
      description,
    });
    await event.save();
    res.status(201).json({ success: true, message: "Event posted successfully!" });
  } catch (error) {
    console.error("Event Posting Error:", error);
    res.status(500).json({ success: false, error: "Failed to post event" });
  }
});

app.get("/events", async (req, res) => {
  try {
    const events = await Event.find();
    res.status(200).json({ success: true, events });
  } catch (error) {
    console.error("Fetch Events Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
});

// Feedback Routes
app.post("/api/feedback", async (req, res) => {
  try {
    const { date, description, rating } = req.body;
    const feedback = new Feedback({ date, description, rating });
    await feedback.save();
    res.status(201).json({ success: true, message: "Feedback submitted successfully!" });
  } catch (error) {
    console.error("Feedback Submission Error:", error);
    res.status(500).json({ success: false, error: "Failed to submit feedback" });
  }
});

app.get("/api/feedback", async (req, res) => {
  try {
    const feedbacks = await Feedback.find();
    res.status(200).json(feedbacks);
  } catch (error) {
    console.error("Fetch Feedback Error:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
