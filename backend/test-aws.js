require('dotenv').config();
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

async function test() {
  const s3 = new S3Client({
    region: 'ap-southeast-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });
  try {
    await s3.send(new ListBucketsCommand({}));
    console.log('SUCCESS: AWS Connection Verified!');
  } catch(e) {
    console.error('FAILED:', e.message);
  }
}
test();
