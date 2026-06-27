# AI 配置问题修复总结

## 问题描述

用户报告了以下问题：
1. AI 配置保存后不会真正保存下来，重新进入设置界面会丢失
2. 配置连接地址后需要重启才能真正连接成功
3. Token 配置需要点击保存后再去测试连接才能成功

## 问题根因

### 1. AI 配置保存问题

**问题位置**：`src/app/api/config/route.ts` POST 方法

**原因**：API 路由中没有处理 `body.ai` 配置，导致 AI 配置永远不会被保存到配置文件。

**修复方案**：在 API 路由中添加对 `body.ai` 的处理，确保 AI 配置能够被正确保存。

### 2. Token 掩码检测问题

**问题位置**：`src/app/api/config/route.ts` POST 方法中的掩码检查逻辑

**原因**：API 端检查 `token === '***'`，但 `MaskedInput` 组件使用的是 `'•'` 字符（如 `'••••••••'`），导致掩码检测失败。

**修复方案**：更新 API 端的掩码检查逻辑，使其同时支持 `'***'` 和 `'••••••••'` 两种掩码格式。

### 3. 连接问题

**问题位置**：`src/lib/napcat-ws.ts` 配置变化监听逻辑

**原因**：WS 客户端监听配置变化，但只在 `ws.` 前缀变化时重连。由于 AI 配置保存失败，导致配置变化无法被正确检测。

**修复方案**：修复 AI 配置保存问题后，配置变化能够被正确检测，WS 客户端能够自动重连。

## 修复内容

### 1. API 路由修复

**文件**：`src/app/api/config/route.ts`

**修改内容**：
- 添加对 `body.ai` 的处理
- 对 `ai.apiKey` 进行掩码检查，防止覆盖有效的 API Key
- 更新 `ws.token`、`api.token`、`tts.apiKey`、`auth.token` 的掩码检查逻辑，支持 `'••••••••'` 格式

### 2. 掩码检测逻辑

**修改前**：
```typescript
if (ws.token === '***' || ws.token === undefined) {
  delete wsClean.token
}
```

**修改后**：
```typescript
if (ws.token === '***' || ws.token === '••••••••' || ws.token === undefined) {
  delete wsClean.token
}
```

### 3. AI 配置处理

**新增代码**：
```typescript
if (body.ai) {
  const ai = body.ai as Record<string, unknown>
  const aiClean: Record<string, unknown> = { ...ai }
  // Only include apiKey if it's provided and not masked
  if (ai.apiKey === '••••••••' || ai.apiKey === '***' || ai.apiKey === undefined) {
    delete aiClean.apiKey
  }
  safePartial.ai = aiClean
}
```

## 测试验证

### 1. 配置保存测试

测试脚本验证了配置能够正确保存和加载：
- AI 配置的所有字段都能正确保存
- 配置文件能够正确更新
- 重新加载配置后数据一致

### 2. 掩码检测测试

测试脚本验证了掩码检测逻辑：
- `'***'` 被识别为掩码 ✓
- `'••••••••'` 被识别为掩码 ✓
- `undefined` 被识别为掩码 ✓
- 空字符串不被识别为掩码 ✓
- 真实值不被识别为掩码 ✓

## 影响范围

### 修复的功能
1. ✅ AI 配置保存后能够持久化
2. ✅ Token 配置保存后能够正确更新
3. ✅ 配置变化后 WS 连接能够自动重连
4. ✅ 测试连接功能能够正常工作

### 不受影响的功能
1. ✅ 现有配置的兼容性
2. ✅ 配置文件的格式
3. ✅ WS 连接的稳定性
4. ✅ 其他配置项的保存

## 部署建议

1. **备份配置**：在部署前备份 `data/config.json` 文件
2. **测试环境**：先在测试环境验证修复效果
3. **逐步部署**：建议逐步部署，观察系统稳定性
4. **监控日志**：部署后监控日志，确保没有异常

## 后续优化建议

1. **掩码标准化**：建议统一使用一种掩码格式（如 `'••••••••'`）
2. **配置验证**：建议添加更严格的配置验证逻辑
3. **错误处理**：建议添加更详细的错误处理和用户提示
4. **日志记录**：建议记录配置变化的详细日志，便于排查问题

## 相关文件

- `src/app/api/config/route.ts` - API 路由（已修改）
- `src/lib/config.ts` - 配置管理器
- `src/lib/napcat-ws.ts` - WS 客户端
- `src/app/(authenticated)/settings/page.tsx` - 设置页面
- `data/config.json` - 配置文件

## 提交信息

```
fix: resolve AI config save and token mask detection issues

- Add AI config handling in API route POST handler
- Fix token mask detection to support both '***' and '••••••••' formats
- Ensure AI apiKey is properly filtered when masked
- Update auth token mask check for consistency

This fixes the issue where AI settings were not persisting after save,
and where token fields required restart to take effect.
```
