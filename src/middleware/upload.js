const path = require('path');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileFilter(_req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.'));
}

// ---------- Shared S3 client ----------
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ---------- Profile picture (uploaded straight to AWS S3) ----------
// Previously saved to local disk, which does NOT persist across redeploys/restarts
// on Northflank (ephemeral filesystem) — the file would silently disappear after
// the next deploy. Moved to S3, same as project images and the resume, so it
// survives redeploys permanently.
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `profile/profile-${unique}${ext}`);
    },
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ---------- Project gallery images (uploaded straight to AWS S3) ----------
const uploadProjectImages = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `projects/project-${unique}${ext}`);
    },
  }),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 70 }, // 8MB per image, max 70 per request
});

function s3KeyFromUrl(url) {
  const prefix = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
  return url && url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

async function deleteFromS3(url) {
  const key = s3KeyFromUrl(url);
  if (!key) return; // not one of our S3 URLs — skip
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error('Failed to delete S3 object:', key, err.message);
  }
}

// ---------- Resume (PDF/DOC, uploaded straight to S3) ----------
const RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function resumeFileFilter(_req, file, cb) {
  if (RESUME_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only PDF, DOC or DOCX files are allowed.'));
}

const uploadResume = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `resume/resume-${unique}${ext}`);
    },
  }),
  fileFilter: resumeFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = { upload, uploadProjectImages, uploadResume, deleteFromS3 };