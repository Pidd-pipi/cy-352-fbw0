<script setup lang="ts">
import { formatSlot, formatYuan } from "../constants/app";
import type { Member, Room, Settlement } from "../types";

defineProps<{ settlements: Settlement[] }>();

function roomName(room: Room | string): string {
  return typeof room === "object" && room ? room.name : "-";
}

function memberName(member: Member | string): string {
  return typeof member === "object" && member ? member.name : "-";
}
</script>

<template>
  <section class="panel">
    <h2 class="panel-title">结算记录</h2>
    <el-table :data="settlements" size="small" empty-text="暂无结算记录">
      <el-table-column label="包厢" min-width="100">
        <template #default="{ row }">{{ roomName(row.room) }}</template>
      </el-table-column>
      <el-table-column label="会员" min-width="90">
        <template #default="{ row }">{{ memberName(row.member) }}</template>
      </el-table-column>
      <el-table-column prop="date" label="日期" min-width="105" />
      <el-table-column label="时段" min-width="125">
        <template #default="{ row }">{{ formatSlot(row.startHour, row.endHour) }}</template>
      </el-table-column>
      <el-table-column label="原价" min-width="95">
        <template #default="{ row }">{{ formatYuan(row.originalAmount) }}</template>
      </el-table-column>
      <el-table-column label="折扣" width="70">
        <template #default="{ row }">{{ (row.discountRate * 10).toFixed(1) }} 折</template>
      </el-table-column>
      <el-table-column label="实付" min-width="95">
        <template #default="{ row }">{{ formatYuan(row.finalAmount) }}</template>
      </el-table-column>
      <el-table-column label="退回余额" min-width="95">
        <template #default="{ row }">{{ formatYuan(row.refundAmount) }}</template>
      </el-table-column>
      <el-table-column prop="pointsEarned" label="积分 +" width="80" />
    </el-table>
  </section>
</template>
