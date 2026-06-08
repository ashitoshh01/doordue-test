require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const { OpenAI } = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client with NVIDIA endpoint
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

// Middleware to serve static files
app.use(express.static(path.join(__dirname, "public")));
// Increase JSON payload limit if needed
app.use(express.json({ limit: "50mb" }));

// Configure multer for file uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOCX, TXT, PNG, and JPEG are allowed."));
    }
  },
});

// Helper function to extract text from files
async function extractText(filePath, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (mimeType === "text/plain") {
      return fs.readFileSync(filePath, "utf-8");
    } else if (
      mimeType === "image/png" ||
      mimeType === "image/jpeg" ||
      mimeType === "image/jpg"
    ) {
      return null; // Return null so we can pass the image directly to the AI
    }
    throw new Error("Unsupported file format for extraction.");
  } catch (error) {
    console.error("Error extracting text:", error);
    throw new Error("Failed to extract text from the document.");
  }
}

// API Endpoint to handle summarize requests
app.post("/api/summarize", upload.single("document"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const customInstructions = req.body.instructions || "";

  try {
    // 1. Extract text
    const isImage = req.file.mimetype.startsWith('image/');
    const extractedText = await extractText(req.file.path, req.file.mimetype);

    if (!isImage && (!extractedText || !extractedText.trim())) {
      return res
        .status(400)
        .json({ success: false, error: "No readable text found in the document." });
    }

    // 2. Prepare prompt
    let systemPrompt = `You are an expert document analyst.

Please analyze the provided document or image and provide a single, concise summary of its contents. 
Do not include extra sections, markdown tables, or raw extracted text. Just provide the summary.
`;

    if (customInstructions) {
      systemPrompt += `\nAdditionally, consider the following custom instructions: ${customInstructions}`;
    }

    let userMessageContent = [];

    if (isImage) {
      // Pass the image directly to the AI model
      const base64Image = fs.readFileSync(req.file.path, { encoding: 'base64' });
      userMessageContent.push({
        type: "image_url",
        image_url: { url: `data:${req.file.mimetype};base64,${base64Image}` }
      });
      userMessageContent.push({
        type: "text",
        text: "Please provide a brief summary of this image."
      });
    } else {
      userMessageContent.push({
        type: "text",
        text: `Document:\n${extractedText}`
      });
    }

    // 3. Call NVIDIA AI model
    const completion = await openai.chat.completions.create({
      model: "moonshotai/kimi-k2.6",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
      temperature: 0.2,
      max_tokens: 16384,
      top_p: 0.7,
    });

    const summary = completion.choices[0].message.content;

    // 4. Return response
    res.json({ success: true, summary: summary });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ success: false, error: error.message || "An error occurred during summarization." });
  } finally {
    // 5. Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
