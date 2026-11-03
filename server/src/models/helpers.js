import mongoose from 'mongoose';

export const toJSONPlugin = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  });
  schema.set('toObject', { virtuals: true, versionKey: false });
};

export const objectIdSchema = {
  type: mongoose.Schema.Types.ObjectId,
  required: true,
};
