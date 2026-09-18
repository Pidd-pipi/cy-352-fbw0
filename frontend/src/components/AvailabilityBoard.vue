<script setup lang="ts">
import { computed } from "vue";
import { BUSINESS_END_HOUR, BUSINESS_START_HOUR, formatYuan } from "../constants/app";
import type { RoomAvailability } from "../types";

defineProps<{ availability: RoomAvailability[]; date: string }>();
const emit = defineEmits<{
  (event: "update:date", value: string): void;
  (event: "pick", roomId: string, startHour: number): void;
}>();

const hours = computed(() => {
  const list: number[] = [];
  for (let hour = BUSINESS_START_HOUR; hour < BUSINESS_END_HOUR; hour += 1) {
    list.push(hour);
  }
  return list;
});

function isOccupied(item: RoomAvailability, hour: number): boolean {
  return item.occupied.some((slot) => slot.startHour <= hour && hour < slot.endHour);
}

function onDateChange(value: string) {
  emit("update:date", value);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">包厢空档</h2>
      <el-date-picker
        :model-value="date"
        type="date"
        value-format="YYYY-MM-DD"
        :clearable="false"
        placeholder="选择日期"
        @update:model-value="onDateChange"
      />
    </div>
    <div class="availability-scroll">
      <table class="slot-table">
        <thead>
          <tr>
            <th class="room-col">包厢</th>
            <th v-for="hour in hours" :key="hour">{{ hour }}:00</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in availability" :key="item.room._id">
            <td class="room-col">
              <strong>{{ item.room.name }}</strong>
              <span class="room-meta">{{ item.room.capacity }} 人 · {{ formatYuan(item.room.hourlyPrice) }}/时</span>
              <span class="room-meta">{{ item.room.facilities.join(" / ") }}</span>
            </td>
            <td
              v-for="hour in hours"
              :key="hour"
              :class="['slot-cell', isOccupied(item, hour) ? 'slot-busy' : 'slot-free']"
              :title="isOccupied(item, hour) ? '已预约' : '空档，点击快速预约'"
              @click="!isOccupied(item, hour) && emit('pick', item.room._id, hour)"
            >
              {{ isOccupied(item, hour) ? "已约" : "空" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
