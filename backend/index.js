// Use ES module imports
import express from "express";
import cors from "cors";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth } from '@clerk/express';

// Import models
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";

// Load environment variables
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

// ✅ Apply Clerk globally


app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(clerkMiddleware());

// MongoDB Connection Function
const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
  }
};

// ImageKit Configuration
const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

// ImageKit Authentication Route
app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

// Create Chat Route (Protected)
app.post("/api/chats", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    const newChat = new Chat({
      userId: userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    const userChats = await UserChats.findOne({ userId });

    if (!userChats) {
      // Create new userChats entry if not exists
      const newUserChats = new UserChats({
        userId: userId,
        chats: [{ _id: savedChat._id, title: text.substring(0, 40) }],
      });
      await newUserChats.save();
    } else {
      // Push new chat to existing userChats array
      await UserChats.updateOne(
        { userId: userId },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
            },
          },
        }
      );
    }

    res.status(201).send(savedChat._id);
  } catch (err) {
    console.error("❌ Error creating chat:", err);
    res.status(500).send("Error creating chat!");
  }
});

// Fetch All User Chats (Protected)
app.get("/api/userchats", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const userChats = await UserChats.findOne({ userId });

    if (!userChats) {
      return res.status(404).send("No chats found for the user!");
    }

    res.status(200).send(userChats.chats);
  } catch (err) {
    console.error("❌ Error fetching user chats:", err);
    res.status(500).send("Error fetching user chats!");
  }
});

// Fetch Individual Chat by ID (Protected)
app.get("/api/chats/:id", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });

    if (!chat) {
      return res.status(404).send("Chat not found!");
    }

    res.status(200).send(chat);
  } catch (err) {
    console.error("❌ Error fetching chat:", err);
    res.status(500).send("Error fetching chat!");
  }
});

// Update Chat History (Protected)
app.put("/api/chats/:id", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      {
        $push: {
          history: {
            $each: newItems,
          },
        },
      }
    );

    res.status(200).send(updatedChat);
  } catch (err) {
    console.error("❌ Error updating chat:", err);
    res.status(500).send("Error adding conversation!");
  }
});

// 🔥 Improved Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ Global Error:", err.stack);

  if (err.code === "permission_denied") {
    return res.status(401).send("Unauthenticated!");
  }

  res.status(404).send("Route not found!");
});

// Start Server
app.listen(port, () => {
  connect();
  console.log(`🚀 Server running on port ${port}`);
});
