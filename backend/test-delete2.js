const mongoose = require('mongoose');
const { Types } = mongoose;

const transactionSchema = new mongoose.Schema({
  csvUploadId: { type: Types.ObjectId, ref: 'CsvUpload', required: true },
  transactionId: String,
});
const csvUploadSchema = new mongoose.Schema({ filename: String });

async function run() {
  await mongoose.connect('mongodb://localhost:27017/woof');
  const Transaction = mongoose.model('TransactionTest', transactionSchema, 'transactions');
  const CsvUpload = mongoose.model('CsvUploadTest', csvUploadSchema, 'csvuploads');
  
  const upload = await CsvUpload.create({ filename: 'test' });
  const uploadId = upload._id;
  await Transaction.create({ csvUploadId: uploadId, transactionId: 'test1' });
  
  const beforeCount = await Transaction.countDocuments({ csvUploadId: uploadId });
  console.log("Before delete:", beforeCount);
  
  await Transaction.deleteMany({ csvUploadId: uploadId }).exec();
  
  const afterCount = await Transaction.countDocuments({ csvUploadId: uploadId });
  console.log("After delete:", afterCount);
  
  await CsvUpload.findByIdAndDelete(uploadId).exec();
  process.exit(0);
}
run();
