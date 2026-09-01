import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Customer, DeliveryPartner } from '../models/user.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { initializeApp, cert } = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
// Look for firebase-adminsdk.json or firebase-service-account.json at the server root
let serviceAccountPath = path.resolve(__dirname, '../../firebase-adminsdk.json');
if (!fs.existsSync(serviceAccountPath)) {
  serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');
}

let firebaseEnabled = false;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
    firebaseEnabled = true;
    console.log("Firebase Admin successfully initialized using local JSON file!");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin from file:", error.message);
  }
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace literal '\n' with actual newlines in case it's passed as a single string
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
    initializeApp({
      credential: cert(serviceAccount)
    });
    firebaseEnabled = true;
    console.log("Firebase Admin successfully initialized using Environment Variables!");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin from ENV variables:", error.message);
  }
} else {
  console.log("Firebase credentials not found (No JSON file or ENV variables). Push notifications are disabled (falling back to console logging).");
}

export const sendPushNotification = async (user, title, body) => {
  if (!user || !user.fcmToken) {
    console.log(`Skipping push notification (no fcmToken for user ${user?.name || user?._id || 'unknown'})`);
    return;
  }

  console.log(`[Push Notification Alert] To: ${user.name || 'User'} (FCM: ${user.fcmToken}) - Title: "${title}" - Body: "${body}"`);

  if (!firebaseEnabled) {
    return;
  }

  const message = {
    notification: {
      title,
      body,
    },
    token: user.fcmToken,
  };

  try {
    const response = await getMessaging().send(message);
    console.log('Firebase Push Notification sent successfully:', response);
  } catch (error) {
    console.error('Firebase Push Notification failed:', error.message);
  }
};
