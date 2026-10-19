const mongoose = require('mongoose');
const { Types } = mongoose;
async function run() {
  await mongoose.connect('mongodb://localhost:27017/woof');
  const count = await mongoose.connection.collection('transactions').countDocuments();
  console.log("Total transactions:", count);
  const uploads = await mongoose.connection.collection('csvuploads').find().toArray();
  console.log("Uploads:", uploads.map(u => ({id: u._id, filename: u.filename, recordCount: u.recordCount})));
  process.exit(0);
}
run();
