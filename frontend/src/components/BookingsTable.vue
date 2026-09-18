<script setup lang="ts">
import { formatSlot, formatYuan } from "../constants/app";
import type { Booking, Member, Room } from "../types";

defineProps<{ bookings: Booking[]; settlingId: string }>();
const emit = defineEmits<{ (event: "settle", booking: Booking): void }>();

function roomName(room: Room | string): string {
  return typeof room === "object" && room ? room.name : "-";
}

function memberName(member: Member | string): string {
  return typeof member === "object" && member ? member.name : "-";
}

function statusType(status: Booking["status"]): "success" | "info" | "warning" {
  if (status === "BOOKED") return "warning";
  if (status === "SETTLED") return "success";
  return "info";
}

function statusLabel(status: Booking["status"]): string {
  if (status === "BOOKED") return "已预约";
  if (status === "SETTLED") return "已结算";
  return "已取消";
}
</script>

<template>
  <section class="panel">
    <h2 class="panel-title">预约记录</h2>
    <el-table :data="bookings" size="small" empty-text="暂无预约">
      <el-table-column label="包厢" min-width="110">
        <template #default="{ row }">{{ roomName(row.room) }}</template>
      </el-table-column>
      <el-table-column label="会员" min-width="90">
        <template #default="{ row }">{{ memberName(row.member) }}</template>
      </el-table-column>
      <el-table-column prop="date" label="日期" min-width="110" />
      <el-table-column label="时段" min-width="130">
        <template #default="{ row }">{{ formatSlot(row.startHour, row.endHour) }}</template>
      </el-table-column>
      <el-table-column label="预付" min-width="100">
        <template #default="{ row }">{{ formatYuan(row.prepaidAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'BOOKED'"
            size="small"
            type="primary"
            :loading="settlingId === row._id"
            @click="emit('settle', row)"
          >
            到店结算
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
