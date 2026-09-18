<script setup lang="ts">
import { computed, reactive } from "vue";
import { BUSINESS_END_HOUR, BUSINESS_START_HOUR, formatYuan } from "../constants/app";
import type { CreateBookingPayload } from "../api/client";
import type { Member, Room } from "../types";

const props = defineProps<{ rooms: Room[]; members: Member[]; date: string; submitting: boolean }>();
const emit = defineEmits<{ (event: "submit", payload: CreateBookingPayload): void }>();

const form = reactive({
  roomId: "",
  memberId: "",
  date: "",
  startHour: BUSINESS_START_HOUR,
  endHour: BUSINESS_START_HOUR + 2,
});

const startOptions = computed(() => {
  const list: number[] = [];
  for (let hour = BUSINESS_START_HOUR; hour < BUSINESS_END_HOUR; hour += 1) {
    list.push(hour);
  }
  return list;
});

const endOptions = computed(() => {
  const list: number[] = [];
  for (let hour = form.startHour + 1; hour <= BUSINESS_END_HOUR; hour += 1) {
    list.push(hour);
  }
  return list;
});

const selectedRoom = computed(() => props.rooms.find((room) => room._id === form.roomId));
const selectedMember = computed(() => props.members.find((member) => member._id === form.memberId));

const estimatedAmount = computed(() => {
  if (!selectedRoom.value) {
    return 0;
  }
  return (form.endHour - form.startHour) * selectedRoom.value.hourlyPrice;
});

const balanceEnough = computed(() => {
  if (!selectedMember.value) {
    return true;
  }
  return selectedMember.value.balance >= estimatedAmount.value;
});

function prefill(roomId: string, date: string, startHour: number) {
  form.roomId = roomId;
  form.date = date;
  form.startHour = startHour;
  form.endHour = Math.min(startHour + 1, BUSINESS_END_HOUR);
}

function onSubmit() {
  emit("submit", {
    roomId: form.roomId,
    memberId: form.memberId,
    date: form.date || props.date,
    startHour: form.startHour,
    endHour: form.endHour,
  });
}

defineExpose({ prefill });
</script>

<template>
  <section class="panel">
    <h2 class="panel-title">新建预约</h2>
    <div class="booking-form">
      <el-select v-model="form.memberId" placeholder="选择会员" class="form-item">
        <el-option
          v-for="member in members"
          :key="member._id"
          :value="member._id"
          :label="`${member.name}（${member.level}，余额 ${formatYuan(member.balance)}）`"
        />
      </el-select>
      <el-select v-model="form.roomId" placeholder="选择包厢" class="form-item">
        <el-option
          v-for="room in rooms"
          :key="room._id"
          :value="room._id"
          :label="`${room.name}（${room.capacity} 人，${formatYuan(room.hourlyPrice)}/时）`"
        />
      </el-select>
      <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" :placeholder="date || '选择日期'" class="form-item" />
      <el-select v-model="form.startHour" placeholder="开始" class="form-item hour-item">
        <el-option v-for="hour in startOptions" :key="hour" :value="hour" :label="`${hour}:00`" />
      </el-select>
      <el-select v-model="form.endHour" placeholder="结束" class="form-item hour-item">
        <el-option v-for="hour in endOptions" :key="hour" :value="hour" :label="`${hour}:00`" />
      </el-select>
      <div class="form-summary">
        <span>
          预付 <b>{{ formatYuan(estimatedAmount) }}</b>
          <template v-if="selectedMember">
            （结算享 {{ (selectedMember.discountRate * 10).toFixed(1) }} 折）
          </template>
        </span>
        <el-tag v-if="selectedMember && !balanceEnough" type="danger" size="small">余额不足</el-tag>
      </div>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!form.memberId || !form.roomId || !(form.date || date)"
        @click="onSubmit"
      >
        提交预约
      </el-button>
    </div>
  </section>
</template>
