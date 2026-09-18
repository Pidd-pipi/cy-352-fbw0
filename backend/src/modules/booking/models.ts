import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * 金额一律以「分」存储，避免浮点误差。
 */

const memberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: String, required: true, enum: ["普通会员", "银卡会员", "金卡会员"] },
    // 会员折扣率，例如 0.8 表示八折
    discountRate: { type: Number, required: true, min: 0, max: 1 },
    balance: { type: Number, required: true, default: 0, min: 0 },
    points: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

const roomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    facilities: { type: [String], default: [] },
    hourlyPrice: { type: Number, required: true, min: 0 },
    // 包厢级预约互斥锁：通过 findOneAndUpdate 原子抢占，串行化同一包厢的预约写操作
    lockOwner: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const bookingSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    member: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startHour: { type: Number, required: true, min: 0, max: 23 },
    endHour: { type: Number, required: true, min: 1, max: 24 },
    // 预约时预付的全额费用（分），结算时按会员折扣多退
    prepaidAmount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: ["BOOKED", "SETTLED", "CANCELLED"], default: "BOOKED" },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

bookingSchema.index({ room: 1, date: 1, status: 1 });

const settlementSchema = new Schema(
  {
    // 幂等锚点：一个预约只能产生一条结算记录
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    member: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    date: { type: String, required: true },
    startHour: { type: Number, required: true },
    endHour: { type: Number, required: true },
    hours: { type: Number, required: true, min: 1 },
    originalAmount: { type: Number, required: true, min: 0 },
    discountRate: { type: Number, required: true, min: 0, max: 1 },
    finalAmount: { type: Number, required: true, min: 0 },
    refundAmount: { type: Number, required: true },
    pointsEarned: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export type MemberDoc = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export type RoomDoc = InferSchemaType<typeof roomSchema> & { _id: Types.ObjectId };
export type BookingDoc = InferSchemaType<typeof bookingSchema> & { _id: Types.ObjectId };
export type SettlementDoc = InferSchemaType<typeof settlementSchema> & { _id: Types.ObjectId };

export const MemberModel = model("Member", memberSchema);
export const RoomModel = model("Room", roomSchema);
export const BookingModel = model("Booking", bookingSchema);
export const SettlementModel = model("Settlement", settlementSchema);
