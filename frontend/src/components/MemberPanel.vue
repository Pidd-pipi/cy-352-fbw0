<script setup lang="ts">
import { reactive } from "vue";
import { formatYuan } from "../constants/app";
import type { Member } from "../types";

defineProps<{ members: Member[] }>();
const emit = defineEmits<{ (event: "recharge", memberId: string, amount: number): void }>();

const rechargeInputs = reactive<Record<string, number>>({});

function onRecharge(memberId: string) {
  const yuan = Number(rechargeInputs[memberId]);
  if (!Number.isFinite(yuan) || yuan <= 0) {
    return;
  }
  emit("recharge", memberId, Math.round(yuan * 100));
  rechargeInputs[memberId] = 0;
}
</script>

<template>
  <section class="panel">
    <h2 class="panel-title">会员储值</h2>
    <div class="member-grid">
      <article v-for="member in members" :key="member._id" class="member-card">
        <header class="member-head">
          <strong>{{ member.name }}</strong>
          <el-tag size="small" :type="member.level === '金卡会员' ? 'warning' : member.level === '银卡会员' ? 'info' : 'success'">
            {{ member.level }} · {{ (member.discountRate * 10).toFixed(1) }} 折
          </el-tag>
        </header>
        <p class="member-metric">余额 <b>{{ formatYuan(member.balance) }}</b></p>
        <p class="member-metric">积分 <b>{{ member.points }}</b></p>
        <div class="recharge-row">
          <el-input-number v-model="rechargeInputs[member._id]" :min="0" :precision="2" placeholder="充值金额(元)" size="small" />
          <el-button size="small" type="primary" @click="onRecharge(member._id)">充值</el-button>
        </div>
      </article>
    </div>
  </section>
</template>
