import { logger } from "../../common/logger";
import { MemberModel, RoomModel } from "./models";

const SEED_ROOMS = [
  { name: "翡翠包厢", capacity: 6, facilities: ["投影", "桌游墙", "沙发"], hourlyPrice: 4800 },
  { name: "琥珀包厢", capacity: 4, facilities: ["电视", "卡牌桌"], hourlyPrice: 3800 },
  { name: "星空大包", capacity: 10, facilities: ["投影", "音响", "长桌", "吧台"], hourlyPrice: 6800 },
  { name: "禅意小包", capacity: 2, facilities: ["榻榻米", "茶几"], hourlyPrice: 2800 },
];

const SEED_MEMBERS = [
  { name: "张三", level: "金卡会员", discountRate: 0.8, balance: 50000, points: 120 },
  { name: "李四", level: "银卡会员", discountRate: 0.9, balance: 20000, points: 40 },
  { name: "王五", level: "普通会员", discountRate: 1, balance: 5000, points: 0 },
  { name: "赵六", level: "金卡会员", discountRate: 0.8, balance: 2000, points: 10 },
];

/** 启动时若库为空则写入示例包厢与会员，保证页面开箱即有数据 */
export async function seedBookingData(): Promise<void> {
  if ((await RoomModel.estimatedDocumentCount()) === 0) {
    await RoomModel.insertMany(SEED_ROOMS);
    logger.info(`Seeded ${SEED_ROOMS.length} rooms`);
  }
  if ((await MemberModel.estimatedDocumentCount()) === 0) {
    await MemberModel.insertMany(SEED_MEMBERS);
    logger.info(`Seeded ${SEED_MEMBERS.length} members`);
  }
}
