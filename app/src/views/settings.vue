<template>
  <view class="page">
    <view class="pagehead">
      <text class="ph-t">设置</text>
    </view>
    <view class="block">
      <view class="empty">
        <text class="empty-t">这一页还没搬过来。</text>
      </view>
    </view>
  </view>
</template>

<!-- 占位。搬这一页时要对着 prototype/index.html 里同名的那个 .page 逐条对齐行为，
     不是照着自己的印象重画一遍 —— 那边的交互是定稿的验收口径。 -->

<style scoped>
.page { padding: 14px 14px calc(76px + env(safe-area-inset-bottom)); }
.pagehead { padding: 4px 2px 12px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }
.block { padding: 10px 14px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); }
.empty { padding: 12px 0; }
.empty-t { font-size: 13px; color: var(--muted); }
</style>
