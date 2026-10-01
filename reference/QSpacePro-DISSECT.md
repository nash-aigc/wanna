# QSpace Pro 100% 拆解

生成日期：2026-10-01
拆解对象：`/Applications/QSpace Pro.app`（只读；本报告是本次唯一被修改/创建的文件）

---

## 0. 资料来源、读法与可靠度分级

### 0.1 材料清单

| 代号 | 材料 | 怎么读的 |
|---|---|---|
| `LS` | `Contents/Resources/zh-Hans.lproj/Localizable.strings`（**1776 条**）+ `en.lproj` 同名文件 | `plutil -convert xml1` 后逐条提取 key→中文；**key 是英文原文，value 是中文原文**，本报告所有中文菜单文案均逐字抄 value |
| `MM` | `Base.lproj/MainMenu.nib`（NIBArchive 格式）+ `zh-Hans.lproj/MainMenu.strings`（109 条） | `strings` 读 nib 得英文标题 + 对象 id（如 `IAo-SY-fd9.title`），再用 `MainMenu.strings` 的同名 key 取中文 |
| `XS:<文件名>` | `zh-Hans.lproj/` 下 **87 个** `.strings`（控制器/设置页各自的本地化） | 同上；key 多为 nib 对象 id（如 `header-sync-presets-cell.title`）或可读标识 |
| `BIN` | 主二进制 `Contents/MacOS/QSpace Pro`（universal，x86_64 + arm64，74,285,840 字节） | `strings` / `grep -a -o -b` / Python 字节偏移扫描。⚠️ **实测：很多 key 在文件里能被 `grep -a -F` 找到，却不出现在 `strings` 的输出行里**（例如 `Get Info`、`Copy Path`），所以本报告的"偏移 N"一律用**字节搜索**得到，不用 `strings` 行号；两条切片各有一份拷贝，报告给的是首份（x86_64 切片）的偏移 |
| `NIB` | `Base.lproj/*.nib`、`Resources/*.nib` 的**文件名**与 nib 内嵌文本 | 文件名本身 = 模块清单 |
| `PL` | `Info.plist`、`FinderExtension.appex/Info.plist` | `plutil -p` |
| `RUNTIME` | 本机已有的运行时配置（**只读参考，不是 App 内置默认**）：`~/Library/Preferences/com.jinghaoshe.qspace.pro.plist`、`~/Library/Application Support/com.jinghaoshe.qspace.pro/{context_menu/conf.json, hotkey.json, sidebar.conf, bookmarks.conf, newfile/conf.json, rename/presets.conf, search.conf, desktop.conf, kind_groups.conf, view_styles.conf, quick_launch/conf.json}`、iCloud 目录下 `*.qsdata`（zip：`main.conf` / `toolbar.json` / `guest/spaces/默认.qs`） | `plutil` / `cat` |
| `JS` | 原型 `/Users/mjm/Documents/SuperAgent/Wanna/app.js` 的 §34/§35/§36 访达段（约 6283–7242 行） | 直接读源码 |

### 0.2 可靠度标注（全文贯彻）

- **【实证】**：条目逐字来自上面某个材料，出处可回查。
- **【推断】**：由命令表 / 处理器 / 相邻字符串 / 通用 macOS 惯例推出，**没有 strings 直接证明其位置或顺序**，一律显式标注。
- **【运行时】**：来自本机配置，证明"这个机制真的这样工作"，但内容是**用户改过的**，不等于出厂默认。

### 0.3 一条重要的二进制读法结论（决定本报告能做到多细）

QSpace 的右键菜单是**运行时构造**的（`JHSContextMenuManager` / `JHSContextMenuConf` / `JHSContextMenuItem` / `JHSContextMenuType`，`BIN` 中均存在），nib 里**没有**现成的右键菜单可直接导出。但二进制里 **Localizable 的 key 按"源码里第一次被引用的顺序"连续排布**，同一个菜单构建函数用到的 key 会聚成一段。本报告第 3 章大量使用这种**连续段**作为排序证据，例如：

- 偏移 `29607328–29608032` 一段连续（命令 id 与标题 key 交替）：`copy_item_to_here`(29607328) → `move_item_to_here`(29607376) → `Remove Downloads`(29607424) / `Show Hidden Files`(29607456) / `Hide Hidden Files`(29607488) / `Paste “%1$@” to %2$@ folders`(29607520) / `Paste %1$@ items to %2$@ folders`(29607568) / `New Folder with Selection`(29607616) → `newfile`(29607696) → `Set as Start Location`(29607728) / `Cancel Start Location`(29607760) / `Always Sort by Name`(29607792) → `move_item_to_view`(29607824) → `Copy to Another Pane`(29607872) / `Move to Another Pane`(29607904) / `Show in another Pane`(29607936) → `services`(29607968) → `decompress_to`(29608032) → 这是一个"标题 + 命令 id"交替的菜单构建函数，即**空白区右键菜单**（详见 §3.3）。
- 偏移 `29671600–29671728`：`Close Other Tabs` / `Close Tab` / `Close Tabs to the Right` / `Close Tabs to the Left` / `Move Tab to New Window` / `Go to Start Location` → **标签页右键菜单**（§3.8）。
- 偏移 `29585312–29585808` 一段连续命令 id：`quicklook → rename → edit_tag → show_in_enclosing_folder → separator → open → add_stash → getinfo → show_in_finder → cut → bookmark → open_in_editor → open_in_terminal`（中间夹着日志串 `search menu item clicked` / `search open editor` / `search open terminal`）→ **文件行 / 搜索结果行菜单家族**（§3.1-J）。
- 偏移 `29635312–29636xxx`：`Drag & Drop Change Confirmation`…`Remember Bookmark Status` / `Show Disk Available Size` / `Eject Disk Confirmation` / `Auto Hide the Eject Button` / `Assign to Same Side Pane` / `Edit Display Name` / `Show in Enclosing Folder` / `Remove from Sidebar` / `Duplicate to Tab` / `Remove Separator` / `Eject All` / `External Disks` / `Disconnect All Servers` → **侧栏条目右键 + 磁盘推出**（§3.4 / §6）。

---

## 1. 应用总览

### 1.1 身份信息【实证 · PL】

| 项 | 值 |
|---|---|
| 显示名 | QSpace Pro |
| Bundle Id | `com.jinghaoshe.qspace.pro` |
| 版本 | **6.3.2.027**（`CFBundleShortVersionString`），Build **522**（`CFBundleVersion`） |
| 最低系统 | macOS 10.15 |
| 版权 | `Copyright © 2019-2026 Tian Wenda. All rights reserved.`（`XS:JHSAboutWindowController`） |
| 二进制 | universal（x86_64 + arm64），74.3 MB，**非菜单栏常驻**（`LSUIElement` 未在主 App 置真；访达扩展才是 `LSUIElement=true`） |
| 开发者团队 | `DEVELOPMENT_TEAM = 6JAT6A85B6`（`SMPrivilegedExecutables` 里特权 helper `com.jinghaoshe.qspace.pro.helper` 的证书 OU） |
| 构建 | Xcode 17B100 / SDK macosx26.1（appex 的 `DTXcode`）；源码路径残迹 `/Users/vitalis/workspace/qspace/code/qspace/`（`BIN` 内 assertion 路径） |
| 沙盒 | **非 App Store 沙盒版**（有 `SMPrivilegedExecutables`、直接读 `/usr/bin/hdiutil`、`/usr/sbin/diskutil`、`/usr/bin/shortcuts`；`XS:JHSOpenModeSettingsView` 里有"由于苹果系统沙盒的限制，我们无法为您操作此设置"的替换访达说明，说明商店版才受限） |

### 1.2 文档类型与系统集成【实证 · PL】

- 声明可打开：`public.folder`（Folder）、`public.volume`（Volume）、`com.apple.finder.smart-folder`（`*.savedSearch` 智能文件夹）、`*`（AllFiles，Viewer）、`*.qsdata`（QSpace Configuration，Owner）、`*.qscolors`（QSpace Color Scheme，Owner）。
- 声明导出类型：`com.jinghaoshe.qspace.qsdata`、`com.jinghaoshe.qspace.qscolors`。
- AppleScript：`OSAScriptingDefinition = QSpace.sdef`（`Resources/QSpace.sdef`）。`BIN` 内有完整 AppleScript 错误文案（"QSpace only supports folder specifiers that use an absolute name." 等）。
- 右键服务（Finder Services，`XS:ServicesMenu`）**5 条**，逐字：
  - `QSpace Pro/Reveal` → **在 QSpace Pro 中显示**（⌘S）
  - `QSpace Pro/Show Info` → **在 QSpace Pro 中显示简介**
  - `QSpace Pro/Add to Stash Shelf` → **添加到 QSpace Pro 暂存架**
  - `QSpace Pro/Advanced Batch Rename` → **在 QSpace Pro 中重命名**
  - `QSpace Pro/File Hash Value` → **在 QSpace Pro 中计算哈希值**
- **Finder 扩展**：`Contents/PlugIns/FinderExtension.appex`（`com.apple.FinderSync`，主类 `FinderExtension.FinderSync`，6.3.2.027/522）。其 `zh-Hans.lproj/Localizable.strings` 只有 3 条：`AppName`→**QSpace Pro**、`Reveal in AppName`→**在 QSpace Pro 中显示**、`Quick Launch`→**快捷启动**。
- **暂存架分享扩展**：`Contents/PlugIns/StashShelfShareExtension.appex`。
- 权限文案（`XS:InfoPlist`）：桌面/文稿/下载文件夹、可移动宗卷、网络宗卷、照片图库、AppleEvents 自动化。

### 1.3 窗口 / 文档结构推断【推断 · 结构由 BIN 类名 + RUNTIME 工作区文件支撑】

QSpace 是"**工作区（Workspace）→ 窗口（Window）→ 窗格（Pane）→ 窗格标签（Pane Tab）**"四层结构，与 macOS 原生标签页（Window Tab）并存：

- 一次会话 = 若干工作区；每个工作区是一棵**分屏布局树**。`RUNTIME:guest/spaces/默认.qs` 是 JSON：`{"name":"默认","addressBarVisible":true,"statusBarVisible":false,"sidePreview":false,"toolbarVisible":true,"rootNode":{"type":0,"weights":[0.5,0.5],"children":[…]}}` —— `type` + `weights` + `children` 即二叉分屏树，叶子是 `paneData:{tabs:[{space:{root,histories,visibleColumns,columnWidths,expands,…}}]}`。
- 相关类（`BIN`）：`JHSWorkspaceWindow` / `JHSWorkspaceWindowController` / `JHSWorkspaceMainViewController` / `JHSWorkspaceLayout` / `JHSWorkspaceLayoutNodeData` / `JHSWorkspacePaneData` / `JHSWorkspaceTabData`、`JHSSplitView` / `JHSHandySplitView`、`JHSPaneContainerView` / `JHSPaneTabBarView` / `JHSPaneTabItemView` / `JHSPaneTabDragPayload` / `JHSPaneMinimizedStripView`。
- 每个窗格 = 一个 `JHSSpaceView`（`JHSSpaceViewType` 三种：**icons / list / columns**，`BIN` 枚举名直接可读），带独立的 `histories`（前进/后退）、`expands`（树展开状态）、`visibleColumns`、`columnWidths`、`sortColumn`、`sortAscend`、`groupby`、`sidePreview` 等（`RUNTIME:默认.qs` 逐字段可见）。
- 废纸篓不是普通目录：`JHSTrashCenter` / `JHSTrashFolder` / `JHSTrashRootEntry` / `JHSTrashRecord`，并有独立的"浮动废纸篓"面板 `JHSTrashCanPanel`。

---

## 2. 主界面结构

整体自上而下：**工具栏（Toolbar，可隐藏/自定义）→ 每窗格的地址栏（Address Bar，可隐藏）→ 内容区（1/2/3/4 窗格分屏 + 可选窗格标签栏）→ 窗格底部条（Side Statusbar，可隐藏）→ 窗口底部状态栏（Status Bar，可隐藏）**；左侧（可选左边栏）与右侧（可选右边栏 + 侧边预览）夹住内容区。

相关显示开关全部来自 `MM`（View 菜单，逐字）：**显示工具栏 / 隐藏工具栏**（`MM:czS-o9-XyH`）、**显示地址栏 / 隐藏地址栏**（`hAM-w3-FIc`）、**显示左边栏 / 隐藏左边栏**（`h5I-tO-ydL`）、**显示右边栏 / 隐藏右边栏**（`84n-7p-utV`）、**显示状态栏 / 隐藏状态栏**（`UHS-8T-gC5`）、**显示侧边状态栏 / 隐藏侧边状态栏**（`HBE-dP-H9I`）、**显示窗格标签栏 / 隐藏窗格标签栏**（`328-0X-Zc0`）、**显示窗口标签栏 / 隐藏窗口标签栏**（`jew-Ud-fiZ`）、**显示窗格预览**（`2bJ-AY-mRU`）/ 底部（`upK-QF-aaM`）/ 右侧（`yM8-QP-myq`）、**显示废纸篓 / 隐藏废纸篓**（`3sI-00-TQA`）、**显示预览**（`qXi-T3-034`）、**浮动暂存架**（`9fm-jt-vgQ`）。

### 2.1 工具栏（Toolbar）

**默认排布（默认项目顺序）**【实证 · `RUNTIME:plist` 的 `NSToolbar Configuration com.jinghaoshe.qspace.QSpaceWindowToolBar` 与 `RUNTIME:toolbar.json` 的 `defaultItemIdentifiers` 完全一致】：

1. `backforward`（返回/前进）
2. `current_folder`（当前位置 / 当前文件夹）
3. `NSToolbarFlexibleSpaceItem`（弹性空白）
4. `viewtypes`（视图类型：图标/列表/分栏）
5. `group_by`（分组）
6. `actions`（操作）
7. `share`（分享）
8. `share_airdrop`（隔空投送）
9. `edit_tag`（标签）
10. `NSToolbarSpaceItem`
11. `connect_to_server`（连接服务器）
12. `NSToolbarSpaceItem`
13. `open_in_terminal`（在终端打开）
14. `open_in_editor`（在编辑器打开）
15. `NSToolbarSpaceItem`
16. `task_status`（任务状态）
17. `NSToolbarSpaceItem`
18. `spotlight_search`（聚焦搜索）
19. `NSToolbarSpaceItem`
20. `open_trash`（废纸篓）
21. `NSToolbarSpaceItem`
22. `workspace_name`（工作区名称）
23. `layouts`（布局选择器）

**当前用户实际排布**【运行时 · `RUNTIME:toolbar.json` `itemIdentifiers`】：`viewtypes` · `group_by` · `move_view_to_left` · `move_view_to_right` · `Spacer` · `download_now` · `connect_to_server` · `copy_path` · `pintop`（窗口置顶）· `open_in_terminal` · `bookmark-group:<uuid>`（**书签组按钮**）· `FlexibleSpace` · `eject`（推出）· `set_as_desktop_background` · `share_airdrop`。

- 显示模式：`displayMode=2`、`sizeMode=1`、`iconSizeMode=1`（即"图标+文字 / 中图标 / 彩色图标"一档；对应 `XS:JHSPreferencesWindowController` 里 `_menuitem_IconAndText / IconOnly / TextOnly` 三个工具栏显示方式菜单项，`BIN` 可见）。
- **可加入工具栏的项目 = 命令 id 全集**（见 §11.1），另含两个只属于工具栏的：`layouts_expanded`（展开的布局面板）、`bookmark-group:<组id>`（书签组）。`BIN` 中工具栏项标题/提示语与命令同表。
- 自定义入口：View 菜单 **自定义工具栏…**（`MM:vk3-sB-C9W` → `runToolbarCustomizationPalette:`）。
- 三个专属工具栏项类（源码路径残迹）：`UI/Toolbar/JHSBackForwardToolbarItem`、`JHSLayoutsToolbarItem`、`JHSTaskStatusToolbarItem`、`JHSViewTypesToolbarItem`、`JHSWorkspaceNameToolbarItem`、`JSToolbarItemSeparator`。

### 2.2 每窗格地址栏（Address Bar）

**地址栏上可显示的元素（设置 → 地址栏 页的开关）**【实证 · `XS:JHSAddressBarSettingsView`】，逐字：

| 元素（中文原文） | key | 二进制设置项（`BIN`） |
|---|---|---|
| 返回/前进 | `yvk-iI-WHM` | `addressbar_element_navigation_visible` |
| 位置 | `8xF-DA-m8A` | （地址栏主体） |
| 前往上层 | `2bh-y9-en3` | `addressbar_element_go_enclosing_visible` |
| 刷新 | `ddI-HP-OMD` | `addressbar_element_reload_visible` |
| 搜索 | `Qye-vN-J0R` | `addressbar_element_search_visible` |
| 操作 | `ZwU-8b-Eiy` | `addressbar_element_action_visible` |
| 书签 | `yJY-Vz-8HS` | `addressbar_element_bookmark_visible` |
| 显示所选项目 | `nJV-8m-sYp` | `addressbar_show_selected_item` |
| 显示元素 | `duO-FR-LWB` | — |
| 在顶部 / 在底部 | `Vhe-lz-peB` / `fV7-MA-lhU` | `addressbar_position` |
| 头部 / 尾部 | `yBd-JM-Dv9` / `9wu-ac-nrR` | — |
| 过长时折叠 | `orx-jh-HTt` | `addressbar_truncate_mode` |
| 仅支持点击 | `oJk-oS-eMu` | — |
| 悬停根节点 / 悬停任意节点 | `NqZ-In-NI5` / `p4P-N8-W4v` | — |
| 展开文件夹内容 | `lU3-Hc-wis` | `address_segment_auto_expand`（`RUNTIME:settings_address_segment_auto_expand=1`） |
| 展开个人文件夹 | `JAf-DS-1Fc` | `addressbar_expand_personal_folders` |
| 默认显示 | `Au6-Ks-KmN` | — |
| 恢复默认 | `E3E-r3-gY6` | — |
| 应用到已打开窗口 | `xHI-SZ-T6g` | — |

- 组成类（`BIN`）：`JHSPathSegmentsView` / `JHSPathSegmentButton` / `JHSPathExpandButton` / `JHSPathFavoriteButton`（书签星标）/ `JHSPathTextField`（可编辑输入）/ `JHSAddressEnterController`（`Resources/JHSAddressEnterController.nib`，配套 `LS` key **`Enter location…` → 「输入地址…」**）。
- 路径段弹出窗 `JHSPathSegmentPopViewController`：`XS:JHSPathSegmentPopViewController` 里唯一显式项是 **`权限设置`**（`9cl-Tx-Hdp`）；其余项来自 `LS`（见 §3.6）。
- 常用命令：**前往路径**（`MM:G7A-2B-XOl` = `Go to Path`，`LS` key `Go to Path`→前往路径）、**前往地址**（`Go to Location`→前往地址）、**输入地址…**（`Enter location…`）。

### 2.3 侧栏（左/右边栏）

详见 §6。结构上是"**分组（Group, type 1–12）+ 条目**"的可折叠清单 + 顶部搜索框 + 底部区块。相关设置项（`BIN` 运行时 key，均在 `RUNTIME` 中有真值）：`sidebar_always_below_toolbar`（左边栏始终在工具栏下方）、`sidebar_autohide_eject_button`（自动隐藏推出按钮）、`sidebar_bold_selected_item_name`（加粗当前标题）、`sidebar_colorful_icons`（彩色图标）、`sidebar_disk_eject_confirmation`（推出磁盘确认）、`sidebar_icon_size_level`、`sidebar_icon_version`（边栏图标版本）、`sidebar_show_disk_available_size`（显示磁盘可用空间）、`sidebar_show_bottom_status_bar`、`sidebar_show_file_stash_shelf`、`sidebar_show_start_location`。

### 2.4 内容区：双（多）窗格与列头

- **窗格数由布局决定**：`单窗格` / `2 列` / `2 行` / `四分窗口` / `左 1，右 2` / `左 2，右 1` / `上 1，下 2` / `上 2，下 1` / `3 行` / `3 列` / `4 列` / `4 行` + `水平分割` / `垂直分割`（见 §7.1，`MM` Layout 子菜单逐字 + 命令 id `apply_layout_0…11`、`layout_split_horizontally/vertically`）。
- **列头（列表视图）**：可显示的列由 `JHSSpaceListColumn` 枚举给出（`BIN`，顺序即枚举顺序）：
  `name, size, kind, sharedBy, lastModifiedBy, fileExtension, created, modified, lastOpened, added, version, comment, tags, rowNumber, fileLocation, linkCount, childCount, owner, group, permissions, dimensions, duration, frameRate, dataRate, audioSampleRate, audioChannelCount, width, height, separator`。
  对应中文（`LS` 逐字）：**名称 / 大小 / 种类 / 共享者 / 上次修改者 / 扩展名（`Extension Name`）/ 创建日期 / 修改日期 / 上次打开日期 / 添加日期 / 版本 / 注释 / 标签 / 行号 / 位置（`Where`→位置，`File Location` 无独立 key【推断】）/ 链接数 / 子项数 / 所有者 / 群组 / 权限 / 尺寸 / 持续时间 / 帧速率 / 比特率（`Bit rate`→比特率）/ 采样率（`Sample Rate`→采样率）/ 音频通道 / 宽度 / 高度 / 分隔（`_Separator`）**。
  默认列（`RUNTIME:settings_spaceview_columns`）= **`Name`, `Size`, `Date Modified`, `Date Added`**；列宽缓存 `cached_listview_column_widths = {Date Added:124, Date Modified:85, Name:499, Size:72}`。
- 列头的列宽/分组/排序 UI 类：`JHSTableHeaderView` / `JHSTableHeaderCell` / `JHSSpaceListColumnsMenuProvider`（列菜单提供者，协议名直接说明右键列菜单存在）。

### 2.5 窗格底部条（Side Statusbar）【实证 · `BIN` 字段表 + `LS`】

`JHSSpaceBottomView` 的字段（`BIN`）：`leftOptionsView` / `readonlyImageView` / `folderSettingsButton` / `lockedButton` / `activatedButton` / **`syncBrowsingButton`** / `commentButton` / `remoteCommandButton` / `rightOptionsView` / `lodSlider`（信息密度滑杆）/ `moreActionButton`；配图 `icon_foldersettings`、`icon_sync_browsing`、`icon_remote_command`、`icon_sidepreview`、`icon_activated_view`、`icon_chosed_view`、`icon_foldersettings_ancestor`。
对应文案（`LS` 逐字）：**锁定当前窗格打开的位置**（`Lock the location of current pane`）、**使用此窗格显示文件夹**（`Use this pane to reveal folder`）、**同步浏览**（`Sync Browsing`）、**在远程服务器上执行命令**（`XS:JHSRemoteCommandViewController` 占位符）、**单独设置文件夹**（`Set Folder Individually`）。

### 2.6 窗口底部状态栏（Status Bar）

- 开关：View 菜单 **显示状态栏 / 隐藏状态栏**；设置项 `settings_space_bottom_statusbar_visible`（本机 = true）。
- 显示选择项大小：设置 → 通用 → 「**在底部状态栏显示选择项目大小。**」（`XS:JHSGeneralSettingsView:9Gx-6y-RRd`），开关 `bottom_statusbar_show_selections_size`。
- 状态栏文案（`LS`）：**选择了 %1$d 项 %2$@（共 %3$d 项 %4$@）** / **选择了 %1$d 项（共 %2$d 项）** / **%d 个项目** / **%1$@可用（共%2$@）** / **%1$@，%2$@未使用**。
- 另有 `settings_statusbar_app_entry`（在状态栏显示应用图标）与 `settings_statusbar_workspace_entry`（显示工作区名称），tooltip 见 `XS:JHSPreferencesWindowController`：`xH8-n0-Ss5`「在系统状态栏显示应用图标」、`T9E-7a-ZrE`「在系统状态栏显示已打开的工作区名称」。

---

## 3. 右键菜单全集（最重要）

### 3.0 机制：菜单是"可配置的命令清单"，不是一张写死的 nib

**代码层**【实证 · `BIN` 类名/字段】：

- `JHSContextMenuManager`（构造与派发）、`JHSContextMenuConf`、`JHSContextMenuItem`、`JHSContextMenuItemType`、`JHSContextMenuType`、`JHSContextMenuRemainGroup`、`JHSContextMenuRemainItem`、`JHSContextMenuSettingsRemainsDropView`、`JHSContextMenuSettingsView`。
- 菜单项类型（`BIN` 枚举 RawValue，逐字）：**`function` / `service` / `workflow` / `quicklaunch` / `viewStyle`**，另有 **`group`**（分组）与 **`separator`**（分隔符）两种结构性项；`LS` 里对应 **`Separator → 分隔符`**、**`—— Separator —— → —— 分割线 ——`**。
- 派发统一走 `menuItemClicked:` / `menuItemClickedWithMenuItem:` / `performMenuAction:`；子菜单处理器（`BIN` selector）：`onMenuOpenWithApp:`、`onMenuAlwaysOpenWithApp:`、`onMenuOpenWithOther:`、`onMenuService:`、`copyToItemClickedWithMenuItem:`、`moveToItemClickedWithMenuItem:`、`showInPaneItemClicked…`、`decompressToItemClickedWithMenuItem:`、`exportDirectoryTreeWithMenuItem:`、`groupStacksByMenuItemClicked:`、`onFoldersTopClickedWithMenuItem:`、`newfileMenuItemClickedWithMenuItem:`、`quickLaunchMenuItemClickedWithMenuItem:`。

**配置层**【实证 · `RUNTIME:context_menu/conf.json`（本机，已被用户改过）+ `BIN` 设置键】：

```json
{"items":[
 {"id":"F6A4…","type":"function","cmd":"com.jinghaoshe.qspace.show_in_finder"},
 {"id":"FFAC…","type":"service","cmd":"BetterZip/Extract with BetterZip"},
 {"id":"7D1F…","type":"function","cmd":"com.jinghaoshe.qspace.new_folder_with_selection"},
 …  type 也可为 "quicklaunch"（值是快捷启动项的 uuid）
]}
```

- 持久化路径：`~/Library/Application Support/com.jinghaoshe.qspace.pro/context_menu/conf.json`（+ 同目录 `icons/` 存菜单项自定义图标），`BIN` 中路径字符串为 `context_menu/conf.json`、`context_menu/icons`。
- 相关设置键（`BIN`）：`context_menu_items`、`context_menu_item_show_icon`、`context_menu_item_name_with_selections`、`context_menu_data_version`、`settings_enabled_context_menu_items`、`settings_service_menu_expand_max_count`。本机值：`settings_context_menu_data_version=2`、`context_menu_item_show_icon=true`、`context_menu_item_name_with_selections=true`。

**设置页 → 「右键菜单」页**【实证 · `XS:JHSContextMenuSettingsView`，逐字】：

- 页内标题/按钮：**访达模式**（`MDe-t3-fgj.title`）、**添加群组**（`OSa-9E-9qc.title`）、**清空**（`QoQ-JP-OKO.title`）、**移除**（`30h-Ol-lrr`）、**默认值**（`fqh-5x-Rp8`）、**菜单项**（`header-menu-items-cell`）、**显示右键菜单项图标**（`label-show-icons-cell`）、**在菜单项中显示选择项**（`label-show-selections-cell`）、`[Function]`（`5Rl-yu-4bF`）。
- 两条说明文案（逐字）：
  - **「拖到此处以禁用...」**（`wTp-gy-o1J`）
  - **「将菜单项从“功能”或“服务”列表中拖拽到左侧列表，即可启用菜单项。拖回可以删除菜单项。你还可以通过拖拽对菜单项进行排序。」**（`wtU-yy-vsh`）
- 即：**左侧 = 已启用菜单项（可拖动排序）；右侧 = 「功能」「服务」（还有快捷启动、视图样式）两个剩余清单（`remainFunctionGroup` / `remainServiceGroup` / `remainQuickLaunchGroup` / `viewStyles`，`BIN` 字段）；拖过去 = 启用，拖回来 = 禁用。**
- 「默认值 / 访达模式」两个动作对应 `LS` 确认框（偏移 29627552 起连续段，逐字）：
  - **「您确定要设置为访达样式吗?」**（`Are you sure you want to set to the Finder style?`）
  - **「您确定要清除所有项目吗?」**（`Are you sure you want to clear all the items?`）
  - 同段还有 **`—— Separator —— → —— 分割线 ——`**、**`Use Default Icon → 使用默认图标`**、视图样式四条确认（`Save View Style…→保存视图样式…` 等）。
- ⭐ **结论**：QSpace 的右键菜单有两种形态——**「访达模式」（Finder 样式，出厂/一键切回）**与**自定义模式（用户拖出来的 function/service/quicklaunch/viewStyle 清单）**；本报告后面每一类菜单给出的是「**固定段 + 可配置段**」两部分。

**「功能」清单 = 命令 id 全集**（每个 id 在 `LS` 里有对应英文 key → 中文），完整表见 §11.1；下面各节只列与该菜单相关的子集。

---

### 3.1 文件（选中文件）右键

> 说明：QSpace 未在 nib 中固化此菜单；下表 = 「固定项（主菜单 File 菜单同款 + `LS` 中的条目级动作）」+「可配置项（conf.json）」。**顺序除注明外为【推断】**。

**A. 打开类（固定，处理器存在）**【实证 · `MM` File 菜单 + `LS`】

| 中文原文 | 出处 |
|---|---|
| 打开 | `MM:IAo-SY-fd9.title`（nib `Open`） |
| 打开方式 | `LS: Open With → 打开方式`（命令 id `open_with`；`BIN` 另有 `always_open_with` → `LS: Always Open With → 始终以此方式打开`） |
| 在新标签页中打开 | `LS: Open in New Tab` |
| 在新窗口中打开 | `LS: Open in New Window` |
| 在编辑器打开 | `MM:koO-iD-qYi.title`（nib `Open in Editor`；命令 `open_in_editor`；`LS` tooltip「在编辑器打开选择的项目」） |
| 在终端打开 | `MM:BYK-g7-3bx.title`（命令 `open_in_terminal`；tooltip「在终端打开选择的文件夹」） |
| 在浏览器打开 | `MM:Z7d-Hu-E7g.title`（命令 `open_in_browser`） |
| 快速查看 | `MM:fA9-Xw-Nhu.title`（命令 `quicklook`；`LS: Quick Look “%@” / Quick Look %@ Items`） |
| 幻灯片放映 | `LS: Slideshow / Slideshow “%@” / Slideshow %@ Items`（命令 `instant_slideshow`） |
| 查看包内容 | `LS: Show Package Contents → 查看包内容`（命令 `show_package_contents`） |
| 显示原身 | `LS: Show Original → 显示原身`（命令 `show_original`） |

**B. 剪贴板 / 路径类**【实证 · `LS` + 命令 id】

拷贝 · 剪切 · 粘贴 · 复制（`LS: Copy→拷贝 / Cut→剪切 / Paste→粘贴 / Duplicate→复制`；命令 `copy/cut/paste/duplicate`）｜**拷贝路径**（`Copy Path`）、**拷贝终端路径**（`Copy Path for Terminal`）、**拷贝 Windows 路径**（`Copy Path for Windows`）、**拷贝文件名**（`Copy Filename`）、**拷贝URL**（`Copy URL`）｜**多重粘贴**（`Multiple Paste→多重粘贴`）、**移动已拷贝**（`Move Copied→移动已拷贝`）。

**C. 重命名 / 新建类**【实证 · `LS` + 命令 id】

- **重命名**（`MM:uVR-Ur-lmD`；命令 `rename`）· **快速重命名**（`Quick Rename→快速重命名`，命令 `quick_rename`，跑 `rename/presets.conf` 里的预置）· **批量重命名**（`Batch Rename→批量重命名`；`XS:JHSBatchRenameLiteController` 里 **高级模式** 按钮）。
- **用所选项目新建文件夹**（`MM:DEO-VO-zgu`；命令 `new_folder_with_selection`；`LS: New Folder with Selection → 用所选项目新建文件夹`）。

**D. 传输 / 整理类**【实证 · `LS` + 命令 id】

- **压缩**（`MM:XfW-Qp-J3z`；`LS: Compress “%@”→压缩“%@” / Compress %@ Items→压缩%@个项目 / Compress Separately→单独压缩 / Compress %@ Items Separately→单独压缩%@个项目`；命令 `compress` / `compress_separately`）
- **解压**（`MM:PHA-a9-0Im`；`LS: Decompress→解压`；命令 `decompress`）
- **解压到...**（`MM:TJS-QH-tkm`；`LS: Decompress to…→解压到...`；命令 `decompress_to`；子菜单处理器 `decompressToItemClickedWithMenuItem:` —— 展开目标 = 快捷位置，见 §3.6）
- **添加到暂存架**（`LS: Add to Stash→添加到暂存架`；命令 `add_stash`）
- **移到废纸篓**（`MM:6NU-OW-sqW`；`LS: Move to Trash`；命令 `trash`）· **直接删除**（`Delete Directly→直接删除`，命令 `remove`）

**E. 显示 / 定位类**【实证 · `LS`】

**显示简介**（`MM:DFZ-wS-EMn`；`LS: Get Info → 显示简介`，命令 `getinfo`；多选时 `LS: Multiple Item Info → 多个项目简介`）｜**在访达中显示**（`Show in Finder`，命令 `show_in_finder`）｜**在上层文件夹中显示**（`Show in Enclosing Folder`，命令 `show_in_enclosing_folder`；偏移 29635584 段）｜**在此文件夹中显示**（`Reveal in this Folder`，偏移 29655312，用于搜索结果/树内定位）｜**在上方/下方/左侧/右侧窗格显示**（`Show in Above/Below/Left/Right Pane`，命令 `show_in_above_view` 等）。

**F. 复制/移动到（子菜单）**【实证 · `MM` File 菜单子菜单 + 命令 id】

- `MM` 中三个子菜单（带 `com.jinghaoshe.qspace.show_in_view` / `copy_item_to_view` / `move_item_to_view` 等 command id）：
  - **Show in Pane → 在窗格显示**：在窗格显示 / 在上方窗格显示 / 在下方窗格显示 / 在左侧窗格显示 / 在右侧窗格显示
  - **Copy to Pane → 复制到窗格**：复制到窗格 / 复制到上方窗格 / 复制到下方窗格 / 复制到左侧窗格 / 复制到右侧窗格
  - **Move to Pane → 移动到窗格**：移动到窗格 / 移动到上方窗格 / 移动到下方窗格 / 移动到左侧窗格 / 移动到右侧窗格
- 另有单目标形态（`LS`）：**复制到此处…（`Copy to Here…`）/ 移动到此处…（`Move to Here…`）/ 复制到…（`Copy to…`）/ 移动到…（`Move to…`）/ 复制到另一窗格（`Copy to Another Pane`）/ 移动到另一窗格（`Move to Another Pane`）**——目标列表来自**快捷位置**（`XS:JHSQuickLocationSettingsView` 明写：**「快捷位置可用作右键菜单中“移动到…”、“复制到…”或“解压到…”的目标。」**）。

**G. 标签 / 注释 / 云状态**【实证 · `LS` + `BIN`】

- **标签…（`Tags…→标签…`）**、**编辑标签…（`Edit Tags…→编辑标签…`）**、**添加标签（`Add Tags→添加标签`）**、偏移 29690784 段：**`Add Tag “%@” → 添加“%@”`** / **`Remove Tag “%@” → 移除“%@”`**；命令 `tags` / `edit_tag` / `add_tag_1…7`（`LS` 里 7 条 **添加标签 1…添加标签 7**）。
- **注释（`Comments→注释`；`LS: Comments of “%@” → “%@”的注释`，命令 `comments`）**
- 云条目（OneDrive/Google Drive/Dropbox/百度网盘/阿里云盘…）偏移 29532576 段逐字：**「将此文件缓存到本地」**（`Cache this file locally`）· **「此文件已缓存到本地」** · **「始终保留在此设备上」**（`Always Keep on This Device`）；命令 `keep_downloaded` / `remove_download` / `download_now`（`LS`：**保留下载 / 移除下载项 / 现在下载**）；`LS` 还有 **拷贝共享链接（`Copy Shared Link`）**、**在线查看（`View Online`）**，`BIN` 有 `qspace.onedrive.copy_shared_link`、`com.dropbox.qspace.view_online` 等专用 id。

**H. 链接 / 权限 / 桌面类**【实证 · `LS` + 命令 id】

**制作替身（`Make Alias`）· 制作符号链接（`Make Symbolic Link`，偏移 29726112）· 制作硬链接（`Make Hard Link`）· 使其可执行（`Make It Executable`）**｜**设为桌面背景（`Set as Desktop Background`，偏移 29727184）· 从桌面移除（`Remove from Desktop`）**｜**计算大小（`Calculate Size`）· 计算哈希值（`Calculate Hash Value`，偏移 29725920）· 比较哈希值（`Compare Hash Values`，偏移 29658640）· 移除哈希值（`Remove Hash Value`）**｜**导出目录树…（`Export Directory Tree…`，偏移 29727344）**｜**更新时间戳（`_touch_command → 更新时间戳`，命令 `touch`）**｜**自定义图标（`Choose Icon→选择图标` / `Use Default Icon→使用默认图标` / `Remove Icon→移除图标` / `Keep Current Icon→保留当前图标` / `Remove Gray Icon→移除灰度图标`，命令 `set_item_icon`）**｜**转换图像（`Convert Image`）· 移除背景（`Remove Background`，偏移 29727280）· 向左/向右旋转（`Rotate Left/Right`）· 水平/垂直翻转（`Flip Horizontal/Vertical`）· 创建PDF（`Create PDF`）· 转为PDF（`Convert to PDF`）**（偏移 29738112 段还有四个 tooltip：**「将媒体向右旋转 90 度」「将媒体向左旋转 90 度」「水平翻转媒体」「垂直翻转媒体」**）。

**I. 隐藏 / 文件夹专属**【实证 · `LS`】

- 隐藏（`Hide→隐藏`）/ 取消隐藏（`Unhide→取消隐藏`），命令 `hidden_files`?——实际是 `hide/unhide` 文件，确认框逐字：**「您确定要隐藏此文件吗?」**、**「您确定要取消隐藏此文件吗?」**、**「您可以按 “⌘ + shift + .” 快捷键来切换隐藏文件显示。」**
- 文件夹专属：**新建文件夹（`New Folder`）**、**展开全部文件夹（`Expand all folders`）/ 折叠全部文件夹（`Collapse all folders`）**（命令 `expand_all`/`collapse_all`，tooltip 见偏移 29738272 段）、**解散文件夹（`Flatten Folder`）、合并文件夹（`Merge Folder`）、文件夹同步（`Folder Sync`）、预置文件夹同步（`Presets of Folder Sync`，偏移 29727120）、单独设置文件夹（`Individual Folder Settings`，偏移 29727440）、移除文件夹设置（`Remove Folder Settings`）、文件夹速览（`Folder Quick View`，偏移 29727312）**。

**J. 段内顺序实证（只对段内项成立）**【实证 · `BIN` 字节偏移 29585312–29585808 连续】

一段连续 id（紧邻 `search menu item clicked` / `search open editor` / `search open terminal` 三条日志字符串）：
`quicklook`(29585312) → `rename`(29585344) → `edit_tag`(29585376) → `show_in_enclosing_folder`(29585472) → `separator`(29585520) → `open`(29585552) → `add_stash`(29585584) → `getinfo`(29585616) → `show_in_finder`(29585648) → `cut`(29585696) → `bookmark`(29585728) → `open_in_editor`(29585760) → `open_in_terminal`(29585808)
→ **快速查看 / 重命名 / 标签 / 在上层文件夹中显示 / 分隔符 / 打开 / 添加到暂存架 / 显示简介 / 在访达中显示 / 剪切 / 收藏(书签) / 在编辑器打开 / 在终端打开**。
⚠️ 这一段与三条 search 日志交错，**既可能是"文件行菜单的构建顺序"，也可能是"搜索结果行菜单 + 共用派发表"**——两者都覆盖这些项，故本表把这 13 项标为【实证存在于该菜单家族】，**精确排序【推断】**。

**K. 可配置段（conf.json 的 type=function 项，本机实例）**【运行时】
`show_in_finder · new_folder_with_selection · move_item_to · rename · quick_rename · convert_image · copy_path · open_with · compress · rotate_right · make_alias · set_as_desktop_background · move_view_to_left · move_view_to_right · tags`（+ type=service 的 BetterZip/MacZip 解压压缩、New Warp Tab Here；type=quicklaunch 的两个自定义项）。

---

### 3.2 文件夹右键

与 §3.1 完全同构，**额外**出现（全部【实证 · `LS`】）：

**新建文件夹 · 新建文件（`New File`）· 用所选项目新建文件夹 · 展开全部文件夹 · 折叠全部文件夹 · 解散文件夹（`Flatten Folder` / `Flatten Folder “%@”`）· 合并文件夹（`Merge Folder “%@”` / `Merge %@ Folders`）· 文件夹同步 · 预置文件夹同步 · 单独设置文件夹 · 移除文件夹设置 · 文件夹速览 · 设为起始位置 / 取消起始位置 · 始终按文件名排序 · 在新标签页中打开 · 在新窗口中打开 · 拷贝到/移动到…**。

**起始位置三条**（空白区/文件夹菜单共用，偏移 29607728 段，逐字）：**「设为起始位置」**（`Set as Start Location`）· **「取消起始位置」**（`Cancel Start Location`）· **「回到起始位置」/「全部回到起始位置」**（`Go to Start Location` / `All Go to Start Location`，后者偏移 29725984；`MM:5PB-Rk-aDe`、`MM:g0H-Lz-rgw`）。
**「单独设置文件夹」确认框**（偏移 29645456 段，逐字）：**「您确定要单独设置当前文件夹的显示和排序方式吗?」** / **「设置后，如果您从其他窗口进入此文件夹，其显示和排序方式将保持一致。」**；移除版：**「您确定要移除当前文件夹的设置吗?」** + **「移除设置后，文件夹的显示和排序方式将跟随其所在窗口设置。」**；还有 **Follow Workspace → 跟随工作区 / Follow Ancestral Folder → 跟随祖先文件夹 / Set Folder Individually → 单独设置文件夹 / Apply to descendant folders → 应用到子文件夹**（`XS:JHSFolderStyleSettingsViewController` + 偏移 29451520 段）。

---

### 3.3 空白区（窗格空白处）右键 —— 含"新建"整套

**这一张菜单的构造段是全部证据里最硬的**【实证 · `BIN` 偏移 29607424–29607936 连续 key + 夹在其间的命令 id】，段内顺序逐字如下：

| 顺序（段内） | key | 中文原文 |
|---|---|---|
| 1 | `Remove Downloads` | 移除下载项 |
| 2 | `Show Hidden Files` | 显示隐藏文件 |
| 3 | `Hide Hidden Files` | 关闭隐藏文件 |
| 4 | `Paste “%1$@” to %2$@ folders` | 粘贴“%@”到%@个文件夹 |
| 5 | `Paste %1$@ items to %2$@ folders` | 粘贴%@个项目到%@个文件夹 |
| 6 | `New Folder with Selection` | 用所选项目新建文件夹 |
| 7 | `Set as Start Location` | 设为起始位置 |
| 8 | `Cancel Start Location` | 取消起始位置 |
| 9 | `Always Sort by Name` | 始终按文件名排序 |
| 10 | `Copy to Another Pane` | 复制到另一窗格 |
| 11 | `Move to Another Pane` | 移动到另一窗格 |
| 12 | `Show in another Pane` | 在另一窗格显示 |

同段命令 id（`BIN` 字节偏移，29607328–29608032）：`copy_item_to_here`(29607328) → `move_item_to_here`(29607376) → [上表 1–12 的标题 key] → `newfile`(29607696) → `move_item_to_view`(29607824) → `services`(29607968) → `decompress_to`(29608032)，并夹着 **`icon_cleanup_small`**、日志 `menu item clicked`。

**所以空白区右键至少包含**（下列 = 段内项 + 同段 id 对应项，其余为【推断】归入）：

1. **新建文件夹**（`MM:2ld-xE-UaM`；id `newfolder`）
2. **新建文件**（`MM:13P-Dk-uY8`；id `newfile`；子菜单 = §4 的模板清单；处理器 `newfileMenuItemClickedWithMenuItem:`）· **新建文件夹**·**用所选项目新建文件夹**
3. **粘贴**（`MM:gVA-U4-sdL`；id `paste`）· **多重粘贴**（`multiple_paste`）· 粘贴为文件的三句 tooltip（`LS`）：**「将剪贴板中的图像和文本粘贴为文件」**（设置项）、**`Read from Clipboard → 读取剪切板`**（偏移 29606560）
4. **显示隐藏文件 / 关闭隐藏文件**（`LS: Show Hidden Files / Hide Hidden Files`；`LS` 还有 **`Show Hidden Files → 显示隐藏文件`** 的 tooltip **「点击可切换是否显示隐藏文件」**）
5. **排序方式 ›**（见 §5.2）· **分组 ›**（见 §5.3）
6. **设为起始位置 / 取消起始位置 / 始终按文件名排序**
7. **复制到另一窗格 / 移动到另一窗格 / 在另一窗格显示**（多窗格时）
8. **刷新**（`MM:TLq-yC-YPj`；id `refresh_view`；tooltip `LS: Reload → 刷新`）
9. **解压到...**（id `decompress_to` —— 把压缩包解压到当前目录）
10. **服务 ›**（id `services`；服务清单见 §3.9）
11. **显示简介**（当前文件夹的简介）· **前往路径 / 前往地址**（id `go_to_path` / `go_to_location`）
12. **在终端打开**（id `open_in_terminal`，对目录）

`LS` 里专属于"目标是目录"的确认文案：**「您想要移动项目到此处吗?」**（`Do you want to move items here?`）、**「您想要复制项目到此处吗?」**（`Do you want to duplicate items here?`）、**「您想要在此处创建替身吗?」**（`Do you want to make item aliases here?`）——即**拖放时按修饰键出现 移动/复制/替身 三选**（§7.3）。

---

### 3.4 侧栏条目右键（磁盘 / 位置 / 书签 / 标签 / 服务器 / iCloud…）

**构造段**【实证 · `BIN` 偏移 29635312–29636xxx 连续 key，段内顺序】：

| 段内顺序 | key | 中文原文 |
|---|---|---|
| … | `Drag & Drop Change Confirmation` | 拖放更改时确认（设置项名，同段说明块） |
| … | `Remember Bookmark Status` | 记住书签状态 |
| … | `Left Sidebar` / `Left Sidebar always below Toolbar` | 左边栏 / 左边栏始终在工具栏下方 |
| … | `Show Disk Available Size` | 显示磁盘可用空间 |
| … | `Eject Disk Confirmation` | 推出磁盘确认 |
| … | `Auto Hide the Eject Button` | 自动隐藏推出按钮 |
| … | `Assign to Same Side Pane` | 分配到同侧窗格 |
| … | `Edit Display Name` | 编辑显示名称 |
| … | `Show in Enclosing Folder` | 在上层文件夹中显示 |
| … | `Enclosing Folder` | 上层文件夹 |
| … | `Remove from Sidebar` | 从边栏移除 |
| … | `Duplicate to Tab` | 复制到标签页 |
| … | `Remove Separator` | 移除分隔符 |
| … | `Eject All` / `Eject All External Disks` | 全部推出 / 推出所有外部磁盘 |
| … | `External Disks` | 外置磁盘 |
| … | `Disconnect All Servers` | 断开所有服务器 |

**所以侧栏条目右键包含**【段内实证 + 惯例【推断】标注】：

- **打开 / 在新标签页中打开 / 在新窗口中打开 / 在上方·下方·左侧·右侧窗格显示**（`Open in New Tab / New Window / Show in … Pane`）【推断：与文件行共用处理器】
- **在上层文件夹中显示**【实证 · 段内】
- **编辑显示名称**（`Edit Display Name`）【实证 · 段内】—— 即书签条目的改名
- **移除书签**（`LS: Remove Bookmark → 移除书签` / `Remove the Bookmark → 移除书签`）· **添加书签**（`Add Bookmark → 添加书签`）
- **从边栏移除**（`Remove from Sidebar`）【实证 · 段内】+ 确认框逐字：**「您确定要从边栏移除“%@”吗?」**（`Do you want to remove “%@” from the Sidebar?`，偏移 29635168）
- **复制到标签页（`Duplicate to Tab`）**【实证 · 段内】
- **移除分隔符（`Remove Separator`）**【实证 · 段内】（当条目是分隔符时出现）
- **磁盘条目专属**：**推出（`Eject→推出`）**、**全部推出 / 推出所有外部磁盘 / 推出所有安装包（`Eject All / Eject All External Disks / Eject All DMGs`）**、**强制推出（`Force Eject / Force Eject…`）**、**断开 / 断开所有服务器（`Disconnect / Disconnect All Servers`）**；确认框逐字（偏移 29635104–29639440 全段）：
  - **「您确定要推出“%@”吗?」**
  - **「您是想要推出“%@”，还是只是将其从边栏隐藏？」**（`Do you want to eject “%@”, or just hide it from the Sidebar?`）← **磁盘右键特有的三选：推出 / 只从边栏隐藏**
  - **「您是否要只推出“%@”，还是推出该磁盘上的所有 %d 个卷。」**（一个物理盘多卷）
  - **「推出该磁盘可能会导致磁盘或其上的信息出现问题。」**
  - **「无法推出 “%@”，磁盘正在使用中。」**（busy）· **「已成功推出 %1$d 个，未推出 %2$d 个」** · **「已全部成功推出」**
  - **「确定要推出 %d 个外部磁盘吗?」/「没有可推出的外部磁盘。」/「确定要推出 %d 个安装包吗?」/「没有可推出的安装包。」**
  - **「请退出以下应用后重试：%@。」**
- 服务器条目：**「确定要断开 %d 个服务器吗?」/「没有可断开的服务器。」/「已全部成功断开」/「已成功断开 %1$d 个，未断开 %2$d 个」**
- 位置条目拖入（运行时）：**「您想要添加 %@ 个书签吗?」/「你想要将“%@”添加为书签吗?」**（偏移 29451808 段）。

**配套设置（本机值）**：`sidebar_autohide_eject_button=true`（自动隐藏推出按钮）、`sidebar_disk_eject_confirmation=true`、`sidebar_show_disk_available_size=false`、`sidebar_colorful_icons=true`、`sidebar_bold_selected_item_name=true`、`sidebar_icon_size_level=0`。

---

### 3.5 侧栏分组右键（组头）

组头 = `JHSSidebarHeaderView` / 分组数据 `sidebar.conf` 的 `type:1` 用户分组（本机组名：**Harness / Agents / APP / Data / NetWork / Skill**）。

**菜单项**【实证 · `LS`（全部存在）+ 位置【推断】】：

| 中文原文 | key |
|---|---|
| 新建分组 | `New Group` |
| 移除分组 | `Remove Group` |
| 添加分隔符 | `Add Separator` |
| 移除分隔符 | `Remove Separator`（段内实证，见 §3.4 表） |
| 编辑显示名称 | `Edit Display Name`（段内实证） |
| 重命名 | `Rename`（`MM:uVR-Ur-lmD` 同词；【推断】组头用它或用"编辑显示名称"） |
| 清空 | `Clear`（`LS: Clear→清理`；【推断】—— 注意 `XS:JHSContextMenuSettingsView` 里也有「清空」，是右键菜单设置页的清空，勿混） |
| 分配到同侧窗格 | `Assign to Same Side Pane`（段内实证；作用于"把这个组放到哪一侧边栏"） |

删除确认（`BIN` 断言串，逐字）：**「移除分组 」**（`Removing group `）+ **「立即删除此分组及其下项目。此操作无法被撤销。」**（`This group and its items will be deleted immediately. You can't undo this action.`）；另有 **「正在移除分组“%@”…」**（`Removing group “%@”…`）。

分组的拖动排序：`sidebar.conf` 数组顺序即显示顺序（【运行时】证据：数组里 type 顺序 2→3→4→8→5→9→6→7→10→11→12→1（用户组））；设置项 `settings_sidebar_remember_bookmark_expanded_status`（记住书签分组展开状态，`BIN`）。

---

### 3.6 地址栏 / 面包屑右键

**地址栏元素**（返回/前进、位置、书签、刷新、搜索、前往上层…见 §2.2）。**右键与路径段弹出**的可用项：

**A. 路径段点击弹出（`JHSPathSegmentPopViewController`）**【实证】：
- `XS:JHSPathSegmentPopViewController` 唯一显式项：**权限设置**（`9cl-Tx-Hdp`）
- 段偏移 29648784–29649008 连续：`Decompress to… → Permission Settings → Do you want to remove the settings of current folder? → You don't have write permission of current folder! → Do you want to set how the current folder is displayed and sorted individually?` → **路径段弹出 = 「解压到…」「权限设置」+ 文件夹设置/权限提示**【段内实证】
- 同族【推断】并入：**在新标签页中打开 / 在新窗口中打开 / 显示简介 / 拷贝路径 / 拷贝终端路径 / 拷贝 Windows 路径 / 拷贝URL / 添加书签 / 在访达中显示 / 锁定当前窗格打开的位置**

**B. 地址栏空白处右键**【推断 · 依据 = 同批命令 + `LS`】：
**拷贝路径（`Copy Path`，偏移 29725568 段内实证）· 拷贝终端路径 · 拷贝 Windows 路径 · 拷贝URL · 前往路径（`Go to Path`）· 前往地址（`Go to Location`）· 回到起始位置 · 刷新 · 在访达中显示 · 添加书签 / 移除书签**。
> 原型 §36.11 的地址栏右键是 `拷贝路径 / 编辑地址 / 粘贴并前往 / 刷新该窗格`（`JS:6802`），**「编辑地址 / 粘贴并前往」两项在 QSpace 的 strings 里没有对应 key**（见 §12）。

**C. 书签星标 / 书签管理**：**添加书签（`Add Bookmark`）· 添加书签（`Add a bookmark`）· 移除书签（`Remove Bookmark`）· 前往书签（`Go to Bookmark`，`MM` Go 菜单族）· 编辑书签**（`Resources/JHSEditBookmarkViewController.nib`、`JHSGotoBookmarkController.nib`；确认框 **「你想要将“%@”添加为书签吗?」**、**「您要更新相关书签吗?」**）。

---

### 3.7 列头右键（列表视图）

**菜单 = 「显示列」勾选清单**【实证 · `BIN`：`JHSSpaceListColumnsMenuProvider` 协议、`onVisibleColumnMenuItemClicked:`、`onHeaderMenuItemClicked:`；列名枚举 §2.4；`LS` 里每个列名的中文】：

勾选项（中文，全部 `LS`）：**大小 · 种类 · 共享者 · 上次修改者 · 扩展名 · 创建日期 · 修改日期 · 上次打开日期 · 添加日期 · 版本 · 注释 · 标签 · 行号 · 位置 · 链接数 · 子项数 · 所有者 · 群组 · 权限 · 尺寸 · 持续时间 · 帧速率 · 比特率 · 采样率 · 音频通道 · 宽度 · 高度**（名称列恒显）。
- 「显示列」相关设置文案：**「显示列：」**（`XS:JHSSpaceListViewOptionsController:Cja-cB-kch`）、**「显示扩展信息：」**（`08b-xG-YWt`，值 **无 / 项目简介 / 大小**）。
- 排序子菜单同屏可达（列头左键 = 排序；`LS: Sort By → 排序`，见 §5.2）；列头右键是否还含排序项 →【推断】含「升序/降序/改变方向」（命令 `sort_change_direction`、`Ascending/Descending/Change Direction`）。
- 图标视图/分栏视图的对应设置：`XS:JHSSpaceIconsViewOptionsController`、`XS:JHSSpaceListViewOptionsController`（分组方式 / 排序方式 / 文件夹置顶 / 始终按文件名排序 / 单独设置文件夹 / 用作默认 / 显示隐藏文件 / 交替行背景色 / 侧边预览）。

---

### 3.8 标签页右键（窗格标签栏 / 窗口标签栏）

**构造段**【实证 · `BIN` 偏移 29671600–29671728 连续 key，段内顺序】：

| 顺序 | key | 中文原文 |
|---|---|---|
| 1 | `Close Other Tabs` | 关闭其他标签页 |
| 2 | `Close Tab` | 关闭标签页 |
| 3 | `Close Tabs to the Right` | 关闭右侧标签页 |
| 4 | `Close Tabs to the Left` | 关闭左侧标签页 |
| 5 | `Move Tab to New Window` | 将标签页移到新窗口 |
| 6 | `Go to Start Location` | 回到起始位置 |

**并入该菜单家族的其余项**【实证 · `LS` + `MM` + 处理器 selector】：

- **复制标签页**（`LS: Duplicate Tab → 复制标签页`；处理器 `onMenuItemDuplicateTab:`）
- **固定标签页 / 取消固定标签页**（`Pin Tab / Unpin Tab`；`onMenuItemTogglePinned:`；`LS` tooltip **「再次按下快捷键可关闭固定标签页」**）
- **新建标签页**（`New Tab`；命令 `new_workspace_tab`；`MM` 无，`LS: New Tab → 新标签页`）
- **显示下一个标签页 / 上一个标签页**（`Show Next Tab / Show Previous Tab`；命令 `show_next_tab/show_previous_tab`）
- **按最近使用顺序切换标签页 / 按最近使用逆序切换标签页**（`Cycle Recently Used Tabs / … in Reverse`；`onMenuItemCycleRecentlyUsedTabs:`）
- **将标签页移到新窗口**（`MM:Hxn-Xd-2jz` 同词）
- **打开到未锁定窗格**（`Open to Unlocked Pane`，设置项同词）
- 窗口标签（Window Tab）额外：**显示所有窗口标签页（`Show All Window Tabs`）· 退出窗口标签页概览（`Exit Window Tab Overview`）· 显示窗口标签栏 / 隐藏窗口标签栏**（偏移 29669152 段实证）
- 双击标签栏关闭：设置「**双击标签栏，关闭标签页**」（`XS:JHSBehaviorSettingsView:JEp-0Q-arW`）

**窗格标签栏样式设置**（`XS:JHSPreferencesWindowController` + `BIN`）：**加粗当前标题**（`pane_tab_bar_bold_current_title`）、**彩色图标**（`pane_tab_bar_color_icon`）、**使用胶囊样式**（`eW7-MS-Vjv`）、**关闭按钮**（`kWp-cB-cel`）、**固定标签页样式**（仅图标 / 图标与标题，`pTs-RO-*`）。

---

### 3.9 其它右键入口（一并列全）

| 位置 | 菜单项（中文原文） | 出处 |
|---|---|---|
| **搜索结果行** | 打开 / 打开方式 / 快速查看 / 重命名 / 标签 / 在上层文件夹中显示 / 添加到暂存架 / 显示简介 / 在访达中显示 / 剪切 / 收藏 / **在编辑器打开 / 在终端打开** | `BIN` 日志串 `search menu item clicked`、`search open editor`、`search open terminal` 与该 id 段同处（§3.1 J） |
| **工具栏空白处** | 自定义工具栏…（`MM:vk3-sB-C9W`）· 显示图标和文字 / 仅图标 / 仅文本（`BIN` `_menuitem_IconAndText/IconOnly/TextOnly`） | `BIN` + `MM` |
| **工具栏「操作」按钮** | 压缩 / 压缩%@个项目 / 单独压缩 / 快速查看 / 快速查看%@个项目 / 幻灯片放映 / 幻灯片放映%@个项目 / 已选择 N 项 | `BIN` 偏移 29710544 段（逐字：`Compress “%@”`…`%d items selected`）【段内实证，归属【推断】为 actions 弹出或多选菜单】 |
| **暂存架** | 移出暂存架 / 查看项目 | `XS:JHSStashShelfPopViewController`（两个 tooltip）；命令 `remove_stash` |
| **暂存架（清空）** | 清理暂存架 | `LS: Clear Stash → 清理暂存架` |
| **废纸篓条目** | 放回原处 | `LS: Put Back → 放回原处`，id `put_back`(29708816) 与 `remove_from_desktop`(29708848) 相邻 |
| **废纸篓（整体）** | 清倒废纸篓… · 将其他项移至废纸篓 · 直接删除其他项 | `MM:M2I-vb-0Me`（清倒废纸篓...）、`LS: Move Others to Trash → 将其他项移至废纸篓`（偏移 29727152）、`LS: Delete Others Directly → 直接删除其他项`（偏移 29726720） |
| **桌面（QSpace 桌面）** | 显示桌面 / 隐藏桌面 / 从桌面移除 / 设为桌面背景 / 更改桌面背景… | `LS`（偏移 29727184–29727248 段）+ 命令 `show_desktop/hide_desktop/remove_from_desktop/set_as_desktop_background/change_desktop_background` |
| **同步选择（双窗格）** | 两边都有 / 仅本侧有 / 本侧较新 / 两边不同 / 对面已选 / 忽略扩展名 / 作用于两侧窗格 / 追加 / 移除 / 选择 / 自动关闭 | `XS:JHSSyncSelectController` 全 11 条逐字 |
| **「功能」剩余清单（右键菜单设置页右侧）** | 见 §11.1 命令全表 | `XS:JHSContextMenuSettingsView` + `BIN` 标题表 |
| **「服务」剩余清单** | 系统服务名（如 `BetterZip/Extract with BetterZip`、`Decompress with MacZip`、`New Warp Tab Here`），上限由 `settings_service_menu_expand_max_count` 控制 | `RUNTIME:conf.json` + `BIN` 键名 |
| **「快捷启动」剩余清单** | 快捷启动条目名（本机：**图片拼接**），可在右键菜单中展开（`XS:JHSQuickLauncherSettingsView: label-expand-context-cell → 在右键菜单中展开`） | `RUNTIME:quick_launch/conf.json` + `XS` |
| **「视图样式」剩余清单** | 自定义视图样式名（`viewStyles`，`BIN` 字段 `dragDropViewStyleType`） | `BIN` |

---

## 4. 新建文件：类型清单与模板机制

### 4.1 入口

- 主菜单 **File → New File**（`MM:13P-Dk-uY8.title` = `New File`；`MM.strings` 同 key → **新建文件**），处理器 `fileNew:` / `onNewfileClicked:`。
- 空白区右键 → **新建文件** 子菜单（命令 id `com.jinghaoshe.qspace.newfile`，属 §3.3 段内项）。
- 设置里可让子菜单展开：`XS:JHSNewfileSettingsView` **「在右键菜单中展开显示」**（`9ln-xe-afp`）、**「显示右键菜单项图标」**（`hXr-X8-FKd`）；`BIN` 键 `newfile_menu_expanded` / `newfile_menu_item_with_icon`。
- 新建时的文件名规则（`XS:JHSPreferencesWindowController:FOV-Bl-CGL` 与 `XS:JHSNewfileSettingsView:2kZ-hP-buh` 两处同文）：
  **「文件名支持格式化的日期表达式：$date(format)」**，另 `XS:JHSNewfileExpressionTipsViewController` 有 **「示例：」**。
- 默认文件名：`LS: untitled.txt → 未命名.txt`、`untitled folder → 未命名文件夹`；`XS:JHSNewfileSettingsView` 的占位值也是 **untitled.txt**。
- 进度文案：`LS: Creating file “%@”… → 正在新建文件“%@”…`、`New File “%@” → 新文件“%@”`。
- 模板选择：`LS: Select the template file for creating new file “%@”. → 选择新建“%@”的模板文件。`、`Use empty “%@” → 使用空“%@”`（模板可留空 = 建空文件）。

### 4.2 模板机制（三件套）

`XS:JHSNewfileSettingsView` 的表格列头（逐字）：**快捷键 / 名称 / 内容 / 模板**；行内还有 **A**（名字列标识）、**0 B**（内容大小）。即每条模板 = `{名称, 内容(可内联写), 模板文件(可从磁盘选), 快捷键}`。

- 存储：`~/Library/Application Support/com.jinghaoshe.qspace.pro/newfile/conf.json`（`BIN` 键 `newfile_version`、`settings_newfile_data_version`（本机 =2）、属性 `default_templates`）。
- 本机实际清单【运行时 · `RUNTIME:newfile/conf.json`】，名称逐字：

| # | 名称 | 说明 |
|---|---|---|
| 1 | **文本.txt** | |
| 2 | **Bash.sh** | |
| 3 | **HTML.html** | |
| 4 | **Swift.swift** | |
| 5 | **python.py** | |
| 6 | **As.applescript** | |
| 7 | **————————** | `LS: —— Separator —— → —— 分割线 ——`，**菜单分隔符条目** |
| 8 | **批量创建文件夹.py** | 指向 `newfile/templates/19A307FAE011411FB778C0F094CA4124` 文件（用户自建模板） |

> 出厂默认清单未在二进制中以字符串形式出现【未找到】；能确证的"出厂材料"是下面这批随 App 打包的文档模板文件。

### 4.3 随包文档模板（`Contents/Resources/` 下的真实文件）【实证 · ls + 二进制连续段】

二进制偏移 `29378672` 起的一段连续串（即 `default_templates` 相关数组）逐字：

```
Scalable Vector Graphics.svg
Hyper Text Markup Language 5.html
Hyper Text Markup Language.html
Extensible Markup Language.xml
Rich Text Format.rtf
OpenDocument Text.odt
OpenDocument Spreadsheet.ods
OpenDocument Presentation.odp
OpenDocument Drawing.odg
Microsoft PowerPoint.pptx
Microsoft Word.docx
Microsoft Excel.xlsx
Microsoft Word.doc
Microsoft PowerPoint.ppt
Microsoft Excel.xls
```

`Resources/` 目录里另外还存在（同族模板实体）：**`Keynote.key` · `Numbers.numbers` · `Pages.pages` · `LaTeX.tex`**；以及 `file.icns`（自定义图标模板用）、`QSpace.sdef`、`Apple.ID`（1216 字节未知二进制数据，未能识别用途【未查清】）。

- 与之配套的 UTI 清单（`BIN` 连续段）：`com.apple.iwork.pages.sffpages` / `com.microsoft.word.doc` / `public.plain-text` / `org.openxmlformats.wordprocessingml.document` / `com.apple.iwork.keynote.sffkey` / `com.microsoft.powerpoint.ppt` / `org.openxmlformats.presentationml.presentation` / `com.microsoft.excel.xls` / `com.apple.iwork.numbers.sffnumbers` / `org.openxmlformats.spreadsheetml.sheet` / `public.comma-separated-values-text`。

### 4.4 「新建文件」可被加进右键菜单的形态

命令 `newfile`（空白区）、`newfolder`（新建文件夹）、`new_folder_with_selection`（用所选项目新建文件夹）；子菜单处理器 `newfileMenuItemClickedWithMenuItem:`；`LS` 相关逐字：**新建文件夹** · **用所选项目新建文件夹** · **用所选项目新建文件夹（%d 项）** · **新建包含%@个项目的文件夹** · **新文件夹“%@”**。

---

## 5. 视图与排序

### 5.1 视图模式

三种（`BIN` `JHSSpaceViewType`：`icons` / `list` / `columns`）：

| 中文 | `LS` key | 命令 id | 主菜单出处 |
|---|---|---|---|
| 为图标 | `as Icons` | `as_icons_view` | `MM:n3v-ci-xq4` |
| 为列表 | `as List` | `as_list_view` | `MM:Qr0-N7-uk8` |
| 为分栏 | `as Columns` | `as_columns_view` | `MM:CgC-AU-4Dg` |

- 工具栏 `viewtypes` 按钮即这三项的切换（tooltip：`LS: Show items as icons, in a list or in columns → 以图标、列表或分栏模式显示项目`）。
- 快捷键（`RUNTIME:hotkey.json`）：**⌘1 为图标 · ⌘2 为列表 · ⌘3 为分栏**。
- 视图样式（View Styles）：`MM` 独立菜单 **视图样式**（`MM:view-styles-menu.title` → `LS: View Styles → 视图样式`）+ 处理器 `onMenuItemApplyViewStyle`；`LS` 逐字：**保存视图样式…（`Save View Style…`）· 将当前视图保存为样式（`Save Current View as Style`）· 管理视图样式…（`Manage View Styles…`）· 已存在同名的视图样式。· 视图样式的名称不能为空且必须唯一。· 删除视图样式？· 替换视图样式？**；`XS:JHSViewStyleManagerController`：**视图样式 / 样式 / 删除**。可给视图样式绑快捷键（`BIN` `JHSHotkeySettingsEntry.viewStyleId`、`viewStyleGroup`；tooltip：`LS: Some selected view styles are currently referenced. Associated shortcuts and the default selection will also be removed.`）。
- 缩放：**放大 `⌘=` / 缩小 `⌘-`**（`RUNTIME:hotkey.json`；`LS: Zoom In → 放大 / Zoom Out → 缩小`）。

### 5.2 排序（Sort By）

**菜单项（`LS` 逐字 + `BIN` 命令 id）**：

| 中文 | key | id |
|---|---|---|
| 名称 | `Name` | `sort_by_name` |
| 种类 | `Kind` | `sort_by_kind` |
| 大小 | `Size` | `sort_by_size` |
| 修改日期 | `Date Modified` | `sort_by_date_modified` |
| 创建日期 | `Date Created` | `sort_by_date_created` |
| 添加日期 | `Date Added` | `sort_by_date_added` |
| 上次打开日期 | `Date Last Opened` | `sort_by_date_last_opened` |
| 标签 | `Tags` | `sort_by_tags` |
| 尺寸 | `Dimensions` | `sort_by_dimensions` |
| 持续时间 | `Duration` | `sort_by_duration` |
| 升序 / 降序 | `Ascending` / `Descending` | — |
| 改变方向 | `Change Direction` | `sort_change_direction` |
| 文件夹置顶 | `Folders on Top` | （设置 `default_sort_folders_ontop`） |
| 始终按文件名排序 | `Always Sort by Name` | 空白区菜单段内项（§3.3） |

- 统一排序模式：`LS: 统一视图排序模式`（`mdU-pa-fj7`，`BIN` 键 `unified_view_sorting_mode`，本机 = true）
- 按类型排序时按扩展名：`LS: 按类型排序时，相同类型按扩展名排序`（`TOx-kH-ssb`，键 `sort_by_extension_for_same_kind`）
- 排序后保持选中可见：`LS: 更改排序后，保持选择项目可见`（`CgG-tV-xWp`，键 `sorting_keep_selections_visible`）
- 默认排序（新建工作区默认值）：`XS:JHSPreferencesWindowController` **默认排序：/ 名称 / 大小 / 修改时间 / 创建日期 / 添加时间 / 升序 / 降序**；本机 `default_sort_column=Name`、`default_sort_ascend=false`
- 快捷键（本机）：**⌥1 名称 · ⌥2 种类 · ⌥3 添加日期**

### 5.3 分组（Group By）

**菜单项（`LS` + `BIN` 命令 id）**：**不分组（`No Group`，`group_by_none`）· 种类（`Kind`，`group_by_kind`）· 扩展名（`Extension Name`，`group_by_extension`）· 大小（`Size`，`group_by_size`）· 修改日期（`group_by_date_modified`）· 添加日期（`group_by_date_added`）· 创建日期（`group_by_date_created`）· 上次打开日期（`group_by_date_last_opened`）· 应用程序（`Application`，`group_by_application`）· 标签（`Tags`，`group_by_tags`）**；工具栏 tooltip：`LS: Change the item grouping → 更改项目的分组方式`。

桌面（QSpace 桌面）另有：**使用叠放（`Use Stacks`）· 叠放分组方式（`Group Stacks By`）**（`XS:JHSDesktopOptionsViewController` 有 **叠放方式：**）。

- 分组视图实体：`JHSSpaceGroupListView` / `JHSSpaceGroupListTableView` / `JHSSpaceViewGroupType` / `floatsGroupRows`（分组行浮动）。
- 设置页文案：`XS:JHSGeneralSettingsView` **分组**（`ruc-3P-Ebk`）、`XS:JHSPreferencesWindowController` **分组：**。

### 5.4 查看显示选项 / 列显示选项

- 主菜单 **查看显示选项**（`MM:fRD-Ip-jGG.title` = `Show View Options`，命令 `show_view_options`，**⌘J**（`RUNTIME:hotkey.json`））。
- 图标视图选项（`XS:JHSSpaceIconsViewOptionsController`，逐字）：**图标尺寸： / 文字大小： / 行间距： / 列间距： / 背景： / 标签位置： / 排序方式： / 分组方式： / 文件夹置顶 / 始终按文件名排序 / 显示隐藏文件 / 显示项目简介 / 显示文件大小 / 透视文件夹内的图片和视频 / 居中对齐 / 左上对齐 / 等比填充 / 右边 / 底部 / 侧边预览 / 单独设置文件夹 / 用作默认 / 颜色 / 图片 / 升序 / 10…16 / 512 / 12（默认）**
- 列表视图选项（`XS:JHSSpaceListViewOptionsController`，逐字）：**图标尺寸： / 文字大小： / 列宽： / 显示列： / 显示扩展信息： / 排序方式： / 分组方式： / 文件夹置顶 / 始终按文件名排序 / 显示隐藏文件 / 交替行背景色 / 项目简介 / 侧边预览 / 单独设置文件夹 / 用作默认 / 大小 / 无 / 32×32 / 240 / 10…16**
- 每视图/每文件夹选项：**单独设置文件夹 / 移除文件夹设置 / 用作默认**（`BIN` 命令 `individual_folder_settings` / `remove_folder_settings`；`XS:JHSGeneralSettingsView`「注意：以下默认选项只在新建工作区时起作用。」）。

---

## 6. 侧栏细节

### 6.1 分区（Group）类型

`sidebar.conf` / `bookmarks.conf` 的 `type` 是 **1–12 的整数**（`RUNTIME` 实证），其内容形状可直接判定：

| type | 内容（`RUNTIME` 逐字节选） | 判定 | 分区名（`LS` 候选 key → 中文） |
|---|---|---|---|
| **1** | `{"items":[…],"_id":"…","aliasName":"Harness"}` 等**用户分组**，条目是路径 | **书签分组（书签区）** | `Bookmarks → 书签` |
| **2** | 空数组（本机隐藏） | **服务器（Servers）**【推断：与 `server_conns.conf` 对应，且空时为空】 | `Servers → 服务器` |
| **3** | `{"url":"volume://…@/Volumes/…"}` + `ignores:[…]` + `{"url":"/"}` | **磁盘（硬盘 / 外置磁盘）** | `Hard Disks → 硬盘`、`External Disks → 外置磁盘`、`Time Machine Backup → 时间机器备份` |
| **4** | `{"url":"tag:灰色"}`… | **标签（Finder 标签）** | `Tags → 标签` |
| **5** | `{"url":"workspace:默认"}` | **工作区** | `Workspace(s) → 工作区` |
| **6** | 纯路径数组（`/Users/mjm/Movies`…） | **快捷位置 / 常用**【推断】 | `Quick Locations → 快捷位置`、`Commons → 常用` |
| **7** | `{"url":"action:preferences.recent_files","aliasName":"已关闭"}` | **最近文件** | `Recent Files → 最近文件` |
| **8** | 空数组 | **暂存架 / iCloud**【推断】 | `Stash Shelf → 暂存架`、`iCloud` |
| **9** | `{"url":"quickrename:CD36F6FA…"}` | **快速重命名预置**（指向 `rename/presets.conf` 的 `> zip`） | —（`XS:JHSBatchRenameSettingsView`：**「在高级模式下，您可以将重命名规则保存为预置。并在右键菜单项“快速重命名”中执行预置。」**） |
| **10 / 11 / 12** | 空 | 未确定【未查清】 | 候选：`Finder Favorites → 访达收藏`、`Smart Folder → 智能文件夹`、`Recent Locations → 最近位置` |
| （无 type） | 分隔符条目（`type` 缺失） | 分隔符 | `Add Separator / Remove Separator → 添加/移除分隔符` |

- 分区标题字符串（`LS`，key 在二进制中均存在，如 `Locations` 偏移 29418567、`Commons` 10140584、`Workspaces` 29418102、`Recent Locations` 29424432、`Finder Favorites` 29424464、`External Disks` 29635722、`Stash Shelf` 29433721、`Bookmarks` 29561255、`Servers` 556544、`iCloud` 687823）：**位置 / 常用 / 书签 / 服务器 / 标签 / iCloud / 外置磁盘 / 硬盘 / 时间机器备份 / 最近位置 / 访达收藏 / 快捷位置 / 暂存架 / 工作区 / 最近文件 / 智能文件夹**。分区与 type 的一一对应为【推断】（枚举 `JHSBookmarkGroupType` 是 Int 型，二进制无字符串名）。
- 条目图标模板（`BIN` 资源名）：`SidebarInternalDisk.icns` · `SidebarRemovableDisk.icns` · `SidebarServerDrive.icns` · `SidebarSmartFolder.icns` · `SidebarUtilitiesFolder.icns` · `SidebariDisk.icns` · `SidebarHomeFolder.icns` · `SidebarDesktopFolder.icns(+Sequoia)` · `SidebarDocumentsFolder.icns` · `SidebarDownloadsFolder.icns` · `SidebarApplicationsFolder.icns` · `SidebarMoviesFolder.icns` · `SidebarMusicFolder.icns` · `SidebarPicturesFolder.icns(+Sequoia)` · `SidebarGenericFile.icns` · `SidebarGenericFolder.icns`；另 `Resources/` 里 `icon_sidebar_net_host.tiff`、`icon_sidebar_vnc.tiff`、`icon_icloud_small.tiff`、`icon_favorite_on.tiff`、`icon_pin_on.tiff`、`icon_lock_green.tiff`、`icon_unlock_gray.tiff`。
- 位置区可排序：`RUNTIME` 键 `settings_sidebar_location_sorting_items`（本机是 22 个卷的有序 id 列表）、`sidebar.conf` 的 `side2_sorted_locations`。

### 6.2 外置磁盘 / 磁盘显示与推出（Eject）

- **推出按钮**：每条磁盘行右侧的 `JHSEjectButton`；设置 **自动隐藏推出按钮**（`LS: Auto Hide the Eject Button`，键 `sidebar_autohide_eject_button`，本机 true）。
- **单个磁盘**：`Eject → 推出`、`Force Eject… → 强制推出…`、确认三连（见 §3.4 全部逐字）。
- **批量**：`推出所有外部磁盘（Eject All External Disks）`、`推出所有安装包（Eject All DMGs）`、`推出磁盘并卸载服务器（Eject disks and unmount servers）` —— 均是命令 id（`eject_all_external_disks` / `eject_all_dmgs` / `disconnect_all_servers`），tooltip 偏移 29738560 段逐字：**「推出所有已载入的安装包」「推出所有可移动外部磁盘」「推出磁盘并卸载服务器」「断开所有已连接的服务器」**。
- **实现**（`BIN`）：`JHSDiskManager` / `JHSDisk` / `JHSDiskPartition` / `JHSDiskVolume` / `JHSDiskAPFSContainer`，外部命令 `/usr/bin/hdiutil`、`/usr/sbin/diskutil`（`AllDisksAndPartitions`、`GUID_partition_scheme`、`Apple_APFS_Container`），卸载队列 `workspaceUnmountQueue`、`workspaceUnmountAndEject(path:)`。
- 相关确认文案见 §3.4；`XS:JHSPreferencesWindowController` 里另有设置行 **「推出磁盘确认」**（`Eject Disk Confirmation`）。

### 6.3 iCloud 分区

- `XS:JHSiCloudSettingsView`（逐字）：**「iCloud云盘」**（`header-icloud-cell`）、**「在 iCloud云盘 中显示应用文件夹」**、三态 **自动 / 自定义隐藏项 / 自定义可见项**、**「查看」**。
- `LS`：**iCloud Drive → iCloud云盘**（主菜单 `MM:JG7-3M-qcN`）、**与我共享（`Shared with Me`）**、**隔空投送（`AirDrop`）**。
- iCloud/云盘条目命令：`keep_downloaded` / `remove_download` / `download_now`（**保留下载 / 移除下载项 / 现在下载**）+ `LS` 逐字 **「将此文件缓存到本地」「此文件已缓存到本地」「始终保留在此设备上」**（偏移 29532576 段）；OneDrive 专用 8 条（偏移 29602256 段，如 **「另一项 OneDrive 固定操作正在进行。」「无法移除已设为“始终保留在此设备上”的 OneDrive 项目的下载内容。」**）。
- 实体：`JHSiCloudManager` / `JHSiCloudLibrary` / `JHSiCloudRootEntry` / `JHSiCloudFolderEntry` / `JHSiCloudFolderDownloader`、设置键 `icloud_disk_folder_aggremode` / `icloud_disk_folder_apps` / `icloud_disk_folder_hidden_apps`。

### 6.4 标签（Tags）

- 侧栏标签区条目用 `tag:` URL（`RUNTIME`：`tag:灰色 / 短视频 / 红色 / 橙色 / 黄色 / 绿色 / 蓝色 / 紫色`）。
- 快捷打标：命令 `add_tag_1`…`add_tag_7`（`LS` 逐字 **添加标签 1 … 添加标签 7**；tooltip **「将标签分配给 %d 个项目」**），默认无快捷键。
- 菜单：**标签…（`Tags…`）· 编辑标签…（`Edit Tags…`）· 添加标签（`Add Tags）· 添加“%@”（`Add Tag “%@”）· 移除“%@”（`Remove Tag “%@”）· 无标签（`_no_tags`）· 按标签着色（`Folder Icon Tint By Tags` 设置：**「根据标签着色」**）**。
- 外观：`XS:JHSAppearanceSettingsView` **标签 → 样式（彩点 / 彩带 / 彩点和彩带）· 彩带亮度 · 标签位置**；`LS: 彩点（`UUh-Zf-4ZB`→彩点）/ 彩带（`CAK-q4-0ia`）/ 彩点和彩带（`IGV-iC-E6s`）**；键 `tag_style`（本机 0）、`tag_ribbon_brightness`（本机 1）。
- 编辑器：`Resources/JHSTagViewController.nib`（`XS:JHSTagViewController` 无正文）、`JHSEditTagColorsView` / `JHSEditTagColorsMenuItem` / `JHSTagEditor` / `JHSTagCandidatesWindow`；设置页 `XS:JHSPreferencesWindowController` 有 **标签位置：**。
- 与 Finder 标签互通：`BIN` `finder_tags` / `_finderTagNames` / `finder_plist_url`；权限页提示 **「注意：需要此权限才能访问 QSpace 中的 Finder 标签或电子邮件。」**（`XS:JHSPermissionSettingsView_Pro`）。

### 6.5 分组（书签组）：新建 / 重命名 / 拖动

- **新建分组（`New Group`）**、**移除分组（`Remove Group`）**、**添加分隔符（`Add Separator`）**、**移除分隔符（`Remove Separator`）**、**编辑显示名称（`Edit Display Name`）** —— 见 §3.5。
- 删除确认（`BIN` 断言 + `LS`）：**「立即删除此分组及其下项目。此操作无法被撤销。」**
- 拖动：分组按 `sidebar.conf` 数组顺序显示；条目拖动 = 换组/换位（`BIN` `dndUserData`/`dndDelegate`、`JHSDropViewDelegate`；侧栏拖放类型枚举 `BIN`：`startpath / bookmark / server / location / finder_tags / workspace / recent_locations / recent_files / smart_folders / quick_rename / finder_favorites / window_tabs / pane_tabs`）。
- 拖入文件的确认（`LS`）：**「您想要添加 %@ 个书签吗?」**、**「你想要将“%@”添加为书签吗?」**、**「您要更新相关书签吗?」**（移动书签后）。
- 记住展开状态：**「记住书签状态」**（`Remember Bookmark Status`，段内实证）+ 键 `settings_sidebar_remember_bookmark_expanded_status`。

### 6.6 书签（Bookmarks）

- 命令：`bookmark`（加书签）、`go_to_bookmark`（前往书签）、`LS: Add Bookmark → 添加书签 / Remove Bookmark → 移除书签 / Bookmarks → 书签 / Go to Bookmark → 前往书签`。
- 管理界面 nib：**`JHSEditBookmarkViewController.nib`（编辑书签）、`JHSGotoBookmarkController.nib`（前往书签，含 `JHSGotoBookmarkCellView/RowView/TableView`）**。
- 工具栏可放**书签组按钮**（本机 `bookmark-group:67C9F87C…`）。
- `LS` 弹窗：**「您想要添加 %@ 个书签吗?」**、**「你想要将“%@”添加为书签吗?」**。

### 6.7 服务器（Servers）

- 连接：命令 `connect_to_server`（工具栏同名项）、`LS: Connect to Server → 连接服务器`（`MM` 亦有）、`disconnect` / `disconnect_all_servers`。
- 配置页 `XS:JHSServerConnSettingsView`（87 条，逐字节选）：**接入云： / 名称： / 地址： / 端口： / 用户名： / 密码： / 启用SSL / 被动模式 / 字符编码： / 私钥文件 / 使用凭证文件 / 认证： / 代理 / 按需连接 / 应用启动时连接 / 退出时卸载 / 存储桶： / 访问密钥： / 客户端密钥： / 基础URL： / 端点： / 区域： / 远程路径： / 关联本地： / 会话令牌： / 客户端ID： / 重定向URL： / 缓存： / 自动清理 / 流媒体： / 启用流媒体 / 拷贝URL时使用 / 拷贝URL时忽略 / 在路径中使用反斜杠 / 日期命令： / MDTM / MFMT / 仅支持 HTTP 1 / 域名风格 / 路径风格 / 自动检测 / SMB / 保存 / 浏览 / 更改**。
- 服务器类型（`BIN` 资源图标）：`icon_network_ftp / sftp / webdav / webdavs`、`icon_aliyun`、`icon_aws`、`icon_qcloud`、`icon_qiniu`、`icon_upyun`、`icon_jdcloud`、`icon_huawei`、`icon_bucket`、`icon_googledrive`、`icon_dropbox`、`icon_onedrive`、`icon_baidunetdisk`、`icon_boxdrive`、`icon_nextcloud`、`icon_seadrive`、`icon_tresorit`、`icon_internxt_drive`、`icon_jianguoyun`、`icon_macdroid`、`icon_mountainduck`、`icon_cloudmounter`、`icon_synologydrive`、`icon_protondrive`、`icon_file_provider` 等；`LS` 区域名列表（阿里云OSS / 亚马逊S3 / S3兼容 / 腾讯云COS / 七牛KODO / 又拍云存储 / 京东云OSS / 华为云OBS / 世纪互联（中国） + 数十个地域中文名）。
- 断开确认见 §3.4；`BIN` 键 `auto_connect_servers`（本机 true）。

### 6.8 暂存架（Stash Shelf）

- 显示：设置「**在侧栏显示暂存架**」（键 `sidebar_show_file_stash_shelf`，本机 false）+ View 菜单 **浮动暂存架（Floating Stash Shelf，`MM:9fm-jt-vgQ`）** + 键 `settings_show_file_stash_float_view`、`auto_hide_stash_shelf`（本机 true，`XS:JHSBehaviorSettingsView`：**自动隐藏暂存浮窗**）。
- 命令：`add_stash`（添加到暂存架）/ `remove_stash`（移出暂存架）/ `clear_stash`（清理暂存架）/ `move_stash_items_here`（将暂存项移动到此处）/ `copy_stash_items_here`（将暂存项复制到此处）。
- 视图与弹出：`JHSStashShelfView.nib`（标题 **Stash Shelf / 暂存架**，`XS:JHSStashShelfView`）、`JHSStashShelfPopViewController`（tooltip **移出暂存架 / 查看项目**）、`JHSStashShelfPanel/Controller/TableView`；分享扩展 `StashShelfShareExtension.appex`；服务菜单 **添加到 QSpace Pro 暂存架**。

---

## 7. 窗格行为

### 7.1 分屏布局（单 / 左右 / 上下 / 3 / 四宫格…）

**`MM` → Layout 子菜单（`MM:LAY-mn-M05.title` → 布局）逐项，含命令 id（全部实证，来自 `MainMenu.nib` 内嵌文本）**：

| 中文（`MM.strings`） | nib 英文 | 命令 id | 图标 |
|---|---|---|---|
| 水平分割 | Split Horizontally | `layout_split_horizontally` | `icon_split_horizontally` |
| 垂直分割 | Split Vertically | `layout_split_vertically` | `icon_split_vertically` |
| 单窗格 | Single Pane | `apply_layout_7` | `icon_layout_template_7` |
| 2 列 | 2 Columns | `apply_layout_1` | `icon_layout_template_1` |
| 2 行 | 2 Rows | `apply_layout_6` | `icon_layout_template_6` |
| 四分窗口 | Quartered Window | `apply_layout_0` | `icon_layout_template_0` |
| 左 1，右 2 | Left 1, Right 2 | `apply_layout_3` | `icon_layout_template_3` |
| 左 2，右 1 | Left 2, Right 1 | `apply_layout_2` | `icon_layout_template_2` |
| 上 1，下 2 | Top 1, Bottom 2 | `apply_layout_4` | `icon_layout_template_4` |
| 上 2，下 1 | Top 2, Bottom 1 | `apply_layout_5` | `icon_layout_template_5` |
| 3 行 | 3 Rows | `apply_layout_10` | `icon_layout_template_10` |
| 3 列 | 3 Columns | `apply_layout_8` | `icon_layout_template_8` |
| 4 列 | 4 Columns | `apply_layout_9` | `icon_layout_template_9` |
| 4 行 | 4 Rows | `apply_layout_11` | `icon_layout_template_11` |

**布局默认快捷键**【运行时 · `RUNTIME:hotkey.json`】：**⌥⌘1=单窗格 · ⌥⌘2=2列 · ⌥⌘3=3列 · ⌥⌘4=四分窗口 · ⌥⌘5=左2右1 · ⌥⌘6=左1右2 · ⌥⌘7=上1下2 · ⌥⌘8=上2下1**。
- 布局树持久化：`RUNTIME:guest/spaces/默认.qs` 的 `rootNode{type,weights,children}`（`weights:[0.5,0.5]` = 两格对半，可拖中缝改比重）。
- 工具栏 `layouts`（默认布局选择器）与 `layouts_expanded`（展开面板）；`XS:JHSPreferencesWindowController` 有 **「默认布局：」**（本机 `settings_default_layout=1`）。
- 面板/选择器：`Resources/JHSLayoutPickerViewController.nib`（无独立 strings，标题即上表）。
- 窗格级操作（`MM` **Pane 子菜单** + `LS`）：**将窗格向上移 / 向下移 / 向左移 / 向右移**（`Move Pane to Above/Below/Left/Right`，id `move_view_to_*`）、**最小化窗格 / 恢复窗格**（`Minimize Pane / Unminimize Pane`，`onMenuItemToggleMaximize`、`togglePaneMinimize:`）、**最大化窗格 / 取消最大化窗格**（`Maximize Pane / Unmaximize Pane`，id `maximize_pane/minimize_pane`）、**增加/减小窗格宽度、增加/减小窗格高度**（`Increase/Decrease Pane Width/Height`）、**将焦点移到上方/下方/左侧/右侧**（`Move Focus to Above/Below/Left/Right`）。
- 窗格操作 tooltip（偏移 29738336 段）：**「向下拆分当前窗格」「向右拆分当前窗格」**。

### 7.2 同步浏览（Sync Browsing）与同步选择（Sync Select）

- **同步浏览**是**窗格底部条上的一颗按钮**（§2.5 `syncBrowsingButton`，图标 `icon_sync_browsing`），文案 `LS: Sync Browsing → 同步浏览`，tooltip（偏移 29739184）**「在文件夹之间同步内容」**；实现痕迹 `BIN` 属性 `_syncBorwsingRoot`（源码里拼错的字段名，实证存在）。
- **同步选择**是 Edit 菜单项（`MM:SyS-Mm-0001.title` = `Sync Select`，处理器 `selectSync:`），限制文案逐字：**「同步选择仅在双窗格窗口中可用。」**（`Sync Select is only available in dual-pane windows.`）。
- 同步选择的选择器（`XS:JHSSyncSelectController` 全部 11 条）：**两边都有 · 仅本侧有 · 本侧较新 · 两边不同 · 对面已选 · 忽略扩展名 · 作用于两侧窗格 · 追加 · 移除 · 选择 · 自动关闭**。
- 左右互拷命令与图标（`LS` + `Resources`）：**复制到右边（`Copy Left to Right`）· 移动到右边（`Move Left to Right`）· 移动到左边（`Move Right to Left`）· 复制到左边（`Copy Right to Left`）**；图标 `icon_sync_copy_to_left.tiff / icon_sync_copy_to_right.tiff / icon_sync_replace_to_left.tiff / icon_sync_replace_to_right.tiff / icon_sync_delete.tiff / icon_sync_prompt.tiff`。
- 「文件夹同步」是另一套（跨目录同步任务，`JHSFolderSyncController/Manager/Item/Preset/Filter`），弹窗 `JHSFolderSyncViewController`（逐字：**更新左边 / 更新右边 / 更新两者 / 同步 / 容差： / 秒 / 过滤 / 包含隐藏项目 / 重新加载**），过滤器 `JHSFolderSyncFilterController`（**包含 / 排除 / 起始为 / 结尾是 / 等于 / 名称： / 类型： / 文件 / 文件夹 / 区分大小写 / 添加 / 取消 / 操作：**）。

### 7.3 窗格之间 / 文件夹之间拖拽

- **移动语义**（`XS:JHSBehaviorSettingsView` 逐字）：**「同磁盘时移动，跨磁盘时复制」**（`kVh-Fp-9E5`）、**「拖放项目操作时，提示确认」**（`B1O-vg-cRB`，键 `drop_items_confirmation`）、**「拖放更改时确认」**（`LS: Drag & Drop Change Confirmation`，偏移 29635312 段）。
- 三种落点确认（`LS` 逐字）：**「您想要移动项目到此处吗?」·「您想要复制项目到此处吗?」·「您想要在此处创建替身吗?」**，以及按目标不同：**「您想要移动“%@”吗?」·「您选择的项目将被移动到“%@”。」·「您选择的项目将被复制到“%@”。」**
- 其它拖拽行为设置（`XS:JHSBehaviorSettingsView` + `BIN` 键）：**悬停时打开文件夹**（`GXx-ml-Byw`，`drag_enter_folder_on_hover`，本机 true）+ **速度**（`drag_enter_folder_on_hover_speed`，本机 2）、**滑动选择**（`Kry-ux-ZsY`，`drag_swipe_to_select`，true）、**拖拽晃动手势**（`BZ5-la-WWr`，`drag_shaking_gesture_action`）+ **晃动手势灵敏度**（`drag_shaking_sensitivity`，-1）。
- 拖到窗格标签栏 = 移动标签（`JHSPaneTabDragPayload`、`JHSPaneTabDragHoverKind`、`pendingCrossWindowMove`、`lastDragOptionCopy`）；拖到别的窗格内容区 = 移动/复制（提示 `LS: Drag items to the right pane above → 拖拽项目到上面右边的窗格`）。
- 拖到侧栏 = 收藏（书签），见 §6.5 确认框。

### 7.4 地址栏编辑与路径跳转

- **编辑入口**：`LS: Enter location… → 输入地址…`（`JHSAddressEnterController.nib`）；`LS: Go to Path → 前往路径`（`MM:G7A-2B-XOl.title`）；`LS: Go to Location → 前往地址`；`LS: Click to edit → 点击编辑`。
- **点击路径段 = 跳到该层**；**段展开按钮**（`JHSPathExpandButton`）受 `address_segment_auto_expand` 控制；`XS:JHSAddressBarSettingsView` 的 **悬停根节点 / 悬停任意节点 / 展开文件夹内容 / 过长时折叠 / 仅支持点击** 决定交互形态。
- **锁定窗格位置**：底部条 `lockedButton`（文案 **锁定当前窗格打开的位置**），锁定后提示逐字（偏移 29646160）：**「当前窗格的位置已被锁定。如果您想更改位置，请先解锁。」**
- **Go 菜单（前往）** —— `MM` 实证项（nib 英文 + `MM.strings` 中文）：**应用程序 · 桌面 · 文稿 · 下载 · 个人 · 实用工具 · iCloud 云盘 · 上层文件夹 · 返回 · 前进 · 回到起始位置 · 全部回到起始位置 · 前往位置 · 前往路径 · 最近访问位置（子菜单） · 废纸篓**（`前往` 菜单标题键 `iah-0g-Mz3`/`v4a-dZ-kX1`；`前往位置` = `55F-KX-Upx`、`前往路径` = `G7A-2B-XOl`。⚠️ 同一 `Go to Location` 在 `LS` 里译作 **前往地址**，两处译法不同，界面以 `MainMenu.strings` 为准）；处理器 `goApplications:/goDesktop:/goDocuments:/goDownloads:/goHome:/goUtilities:/goiCloudDrive:/goUpfolder:/goBack:/goForward:/gotoStartLocation:/gotoStartLocationAllPanes:/gotoLocation:/gotoPath:/goTrash:`。
- **「从外部打开」**（`XS:JHSOpenModeSettingsView`）：**「选择用以展示从外部打开路径的工作区（比如搜索、命令行、访达服务或代替“在访达中显示”）。」** + 打开模式三选 **在当前窗口打开 / 在新窗口中打开 / 打开到未锁定窗格**（`Open in Current Window / New Window / Open to Unlocked Pane`）。

---

## 8. 文件树折叠（列表内文件夹展开/折叠）

**有，且是"每窗格持久化"的展开集合。** 五条实证：

1. **数据结构**：`RUNTIME:guest/spaces/默认.qs` 的每个 pane 有 `"expands":[]`（展开中的条目路径数组）与 `"startPathCollapsed"`；pane 状态字段还有 `listview_cd_keep_expands` 对应的设置（`XS:JHSBehaviorSettingsView` 逐字 **「保持列表视图展开项」**，`Hkl-Qn-HJr`；`BIN` 键 `listview_cd_keep_expands`）。
2. **行级实现**：`BIN` `JHSSpaceViewRowView`（列表行）+ `JHSSpaceViewRowExpandPosition`（展开箭头位置）+ `_expandedItems` + `wasExpandableInList` 字段（"这一行在列表里是否可展开"）。
3. **全局命令**：**展开全部文件夹（`Expand all folders`）· 折叠全部文件夹（`Collapse all folders`）**，命令 id `expand_all` / `collapse_all`，tooltip（偏移 29738272 段）同词；`LS` 另有菜单级 **全部展开（`Expand All`）· 全部折叠（`Collapse All`）**。
4. **可展开的对象不止文件夹**：
   - 压缩包（`XS:JHSArchiveSettingsView` 逐字：**「可直接在分栏视图中展开」`label-expand-columns-cell`、「可直接在列表视图中展开」`label-expand-list-cell`、「可展开的最大文件大小」`label-expand-limit-cell`**；键 `settings_archive_expandable_in_columns_view=true` / `…in_list_view=false` / `…auto_expand_maxsize=-1`）。
   - 应用包：`LS: Packages with the following extensions will be expandable in list and column views: → 具有以下扩展名的包可在列表和分栏视图中展开：`（`XS:JHSPreferencesWindowController` 同文），设置行 **「展开包内容」**（`pkg-exp-cell`，`XS:JHSBehaviorSettingsView`），键 `expandable_package_contents`。
   - 压缩包扩展名清单：`BIN` 键 `support_archives` / 本机 `settings_support_archive_exts = zip, rar, 7z, gz, gzip, tgz, tar, gtar, tbz2, bz2, bzip2, txz, xz, z, lzma, lz, z01, 001, r01`。
5. **分栏视图的层级展开**（`JHSSpaceColumnsListView` / `JHSSpaceColumnsEntryScrollView` / `JHSSpaceColumnsSplitView`）：设置 `columnsview_folder_open_action` 三选（`XS:JHSBehaviorSettingsView` 逐字）：**「在父文件夹中打开」「作为根文件夹打开」「在当前选择处打开」**；`XS:JHSPreferencesWindowController` 另有 **「分栏视图中的文件夹」「分栏视图预览宽度自适应」「分栏视图列宽」「继承前一列」**。

---

## 9. 快捷键（`JHSHotkeySettingsView.strings` 全部快捷键项）

### 9.1 设置页本身的文案（`XS:JHSHotkeySettingsView`，全部 9 条逐字）

- **主快捷键**（`5lZ-Hy-Kum`）
- **副快捷键**（`Il9-ku-3kS`）
- **全局**（`gms-Ji-8jW`）
- **操作**（`jlw-gb-Oub`）
- `Action`（`u2R-jy-fyI`）
- `Workspace`（`5QK-gj-TtV`）—— 工作区分组
- **恢复默认**（`Q7T-8h-yhk`）+ tooltip **「恢复默认值」**（`KPe-JP-WaV`）
- 提示（`tCm-AN-YoU`，逐字）：**「提示：已保存的工作区窗口可以分配快捷键。对于同一操作，可以分配两个不同的快捷键。\n修饰键：⌃ (control)、⌥ (option)、⌘ (command)、⇧ (shift)、⇥ (tab)」**

### 9.2 分组结构（`BIN` 实证）

- `JHSHotkeySettingsView` 字段：`searchField` · **`spaceGroup`**（工作区/窗格）· **`launchGroup`**（快捷启动）· **`newfileGroup`**（新建文件）· **`quickLocationGroup`** · **`serviceGroup`**（服务）· **`viewStyleGroup`**（视图样式）· `groups` / `_rawGroups`；单元格 `JHSHotkeySettingsCellView`：`globalButton`（全局开关）· `conflictButton`（冲突提示）· `revertButton`（恢复该项）· `hotkeyControl` · `secondaryHotkeyControl`（主/副两栏）。
- 动作槽位类型（`JHSHotkeySettingsEntry`）：`action` / `workspace` / `launcherId` / `newfileId` / `locationId` / `serviceId` / `viewStyleId` + `isEnabled` / `canBeGlobal` / `isGlobalByDefault` / `subtitle`。
- 分组 key（`BIN`）：`_space_actions` / `_space_secondary_actions`、`_launcher_actions`、`_newfile_actions`、`_location_actions`、`_viewStyle_actions`、`_actionHotkeys` / `_actionSecondaryHotkeys`、`_serviceHotkeys` / `_serviceSecondaryHotkeys`、`default_hotkeys` / `default_secondary_hotkeys`。
- **全局（Global）动作清单**（`BIN` 连续 RawValue，逐字）：
  `global_activate_workspaces` · `global_new_workspace` · `global_spotlight_search` · `global_floating_stash_shelf` · `global_clear_stash` · `global_finder_go_current_location` · `global_show_desktop` · `global_hide_desktop` · `global_show_trash_can` · `global_float_trash_can` · `global_goto_bookmark` · `global_eject_all_external_disks` · `global_eject_all_dmgs` · `global_disconnect_all_servers`（每条都有 `global_secondary_*` 副快捷键对应）。

### 9.3 当前实际绑定（`RUNTIME:hotkey.json`，101 条，只列**有值**的 36 条；其余 `hotkey:""` = 未绑定）

| 动作 id | 主快捷键 | 副 | 全局 |
|---|---|---|---|
| `rename` | ⇧⌘R | | 否 |
| `search` | ⌘F | （条目含 `secondaryHotkey` 字段） | 否 |
| `go_enclosing_folder` | ⌘↑ | | 否 |
| `go_downloads` | ⌥D | | 否 |
| `go_desktop` | ⌘D | | 否 |
| `start_path` | ⇧⌘↑ | | 否 |
| `go_to_start_location` | ⇧⌘↓ | | 否 |
| `show_in_finder` | ⌘↩ | | 否 |
| `getinfo` | ⇧⌘I | | 否 |
| `show_view_options` | ⌘J | | 否 |
| `copy_path` | ⇧⌘L | | 否 |
| `close` | ⌘W | | 否 |
| `new_workspace_tab` | ⌘T | | 否 |
| `show_next_tab` | ⇧⌘→ | | 否 |
| `show_previous_tab` | ⇧⌘← | | 否 |
| `as_icons_view` | ⌘1 | | 否 |
| `as_list_view` | ⌘2 | | 否 |
| `as_columns_view` | ⌘3 | | 否 |
| `zoom_in` | ⌘= | | 否 |
| `zoom_out` | ⌘- | | 否 |
| `sidebar2`（右边栏） | ⌥⌘S | | 否 |
| `sort_by_name` | ⌥1 | | 否 |
| `sort_by_kind` | ⌥2 | | 否 |
| `sort_by_date_added` | ⌥3 | | 否 |
| `rotate_right` | ⌥R | | 否 |
| `apply_layout_7`（单窗格） | ⌥⌘1 | | 否 |
| `apply_layout_1`（2列） | ⌥⌘2 | | 否 |
| `apply_layout_8`（3列） | ⌥⌘3 | | 否 |
| `apply_layout_0`（四分） | ⌥⌘4 | | 否 |
| `apply_layout_2`（左2右1） | ⌥⌘5 | | 否 |
| `apply_layout_3`（左1右2） | ⌥⌘6 | | 否 |
| `apply_layout_4`（上1下2） | ⌥⌘7 | | 否 |
| `apply_layout_5`（上2下1） | ⌥⌘8 | | 否 |

> 未绑定但**可绑**的动作（同文件里 `hotkey:""` 的 65 条）逐字节选：`go_back / go_forward / go_home / go_documents / go_applications / go_utilities / go_icloud_drive / go_to_bookmark / open_trash / empty_trash / tab_overview / tab_bar / status_bar / sidebar / fullscreen / pintop / duplicate / print / save / compress / decompress / trash / remove / quicklook / open_in_editor / open_in_terminal / new_workspace / delete_current_workspace / activate_workspaces / group_by_* / sort_by_* 其余 / add_tag_1…7 / show_tab_1…9 / move_view_to_* / move_focus? 等`。
> ⚠️ 两个 id 拼写异常（照抄，说明是硬编码 rawValue）：**`com.jinghaoshe.qspacce.show_trash_can`**（`qspacce` 多一个 c）、**`com.jinghaoshe.show_file_extension` / `com.jinghaoshe.hide_file_extension`**（少了 `.qspace`）。

### 9.4 出现在 `LS` 里的其余快捷键说明（逐字）

- **「您可以按 “⌘ + shift + .” 快捷键来切换隐藏文件显示。」**
- **「将匹配的项目附加到选择 (⌘D)」「从选择中移除匹配的项目 (⌘E)」「选择匹配的项目 (⏎)」**（按条件选择的三条）
- **「再次按下快捷键可关闭固定标签页」**
- 主菜单键位（`MainMenu.nib` `NSKeyEquiv`）：**Reveal = ⌘S**（`LS: QSpace Pro/Reveal`）；`RUNTIME` 里还有系统级 `⌘↩ = 在访达中显示`（即 `show_in_finder`）。

---

## 10. 设置面板全清单（87 个 strings 逐个一行）

### 10.1 设置窗口骨架

- 窗口：`JHSPreferencesWindowController.nib`，标题 **「QSpace 偏好设置」**（`XS:JHSPreferencesWindowController:QvC-M9-y7g`）；侧栏 `JHSPreferencesSideViewController.nib`（`XS` 只有 **General**、**新版本** 两条）；导航类 `JHSPreferencesCategoryRow` / `JHSPreferencesViewItem` / `JHSPreferencesMainViewController` / `JHSPreferencesSelectionController`。
- **导航分类枚举（23 个 RawValue，`BIN` 连续段逐字，顺序即枚举顺序）**：
  `general → appearance → behaviors → permissions → connections → search → quick_launch → hotkeys → addressbar → context_menu → newfiles → folder_sync → quick_locations → batch_rename → custom_icons → palette → file_color → open_mode → archive → functions → icloud → invitations → app_version`
- 配套图标（`Resources/icon_prefs_*.tiff`）24 个：`general, appearance, behaviors, permission, connections, search, quicklauncher, hotkey, addressbar, context_menu, newfile, folder_sync, quick_locations, batch_rename, custom_icon, palette, file_color, open_mode, archive, functions, icloud, invitations, app_version, **sidebar**`。⚠️ **`icon_prefs_sidebar.tiff` 存在但分类枚举里没有 `sidebar`**——边栏设置实际在「外观」页的 **「边栏」** 分组里（`XS:JHSAppearanceSettingsView: header-sidebar-cell → 边栏`），该图标【用途未查清】。

### 10.2 23 个设置页（一行一个）

| # | 分类 key | strings 文件 | 页内功能（该文件文案归纳，逐字节选） |
|---|---|---|---|
| 1 | `general` | `JHSGeneralSettingsView` | 通用：新建工作区默认值（视图/排序/分组/文件夹置顶/侧边预览）、预览与状态（计算所有大小「可能会影响浏览速度，建议仅必要时开启」、项目简介、窗格预览、状态栏、在底部状态栏显示选择项目大小）、最近（记录最近打开文件/记录最近访问位置）、工作区（默认工作区、忽略未保存工作区、工作区保存、包含隐藏项目）、启动窗口、边栏、工具栏、布局 |
| 2 | `appearance` | `JHSAppearanceSettingsView` | 外观：主题（跟随系统/浅色/深色、主题色、主题强度、应用图标）、字体（文字大小/文件夹/替身）、图标（预览尺寸、总是预览图片和视频文件、透视文件夹）、窗格（当前窗格、非当前窗格亮度、高亮地址栏、显示边框、圆角、标签栏、固定标签页样式、关闭按钮位置）、边栏（图标大小、彩色图标、加粗当前标题）、文件夹图标（着色、根据标签着色、标记非空项）、标签（样式=彩点/彩带/彩点和彩带、彩带亮度）、在地址栏中使用彩色图标 |
| 3 | `behaviors` | `JHSBehaviorSettingsView` | 使用习惯（14 组，见 10.3）：应用与系统 / 拷贝与粘贴 / 显示 / 文件操作 / 隐藏文件 / 键盘 / 鼠标按钮操作 / 鼠标与触控板 / 导航 / 排序 / 暂存架 / 标签页 / 任务 / 窗口与工作区 |
| 4 | `permissions` | `JHSPermissionSettingsView_Pro` | 权限设置：完全磁盘访问权限（说明逐字：「如果您想通过 QSpace 管理您的隐私文件。比如，桌面文件夹、文档文件夹、可移动卷宗、废纸篓、邮件、访达标签、以及部分设置文件等。需要在相关设置页添加“QSpace Pro.app”到“完全磁盘访问权限”列表。」「注意：需要此权限才能访问 QSpace 中的 Finder 标签或电子邮件。」） |
| 5 | `connections` | `JHSServerConnSettingsView` | 连接：服务器/云连接配置（名称/地址/端口/账号/密钥/SSL/私钥/存储桶/端点/区域…，见 §6.7） |
| 6 | `search` | `JHSSearchSettingsView` | 搜索：搜索语法（「并且」分隔符 `&`、「或者」分隔符空格、「排除」前缀符 `-`）、选项（记录最近搜索位置、记住搜索域、最近搜索 5/10/20 项、显示项目、打开到=当前窗口/新窗口/标签页、扩展名/名称/种类/UTI 列） |
| 7 | `quick_launch` | `JHSQuickLauncherSettingsView` | 快捷启动：「以下应用将在快捷启动区内显示，您可以自定义启动应用或服务。」自定义项、在右键菜单中展开、在自定义工具栏中展开、显示右键菜单项图标、类型（App/命令/快捷指令/打开文件/在终端打开/在编辑器打开）、启动参数 |
| 8 | `hotkeys` | `JHSHotkeySettingsView` | 快捷键（见 §9） |
| 9 | `addressbar` | `JHSAddressBarSettingsView` | 地址栏（元素开关 + 位置/折叠/悬停/展开，见 §2.2） |
| 10 | `context_menu` | `JHSContextMenuSettingsView` | 右键菜单（见 §3.0） |
| 11 | `newfiles` | `JHSNewfileSettingsView` | 新建文件（见 §4） |
| 12 | `folder_sync` | `JHSFolderSyncSettingsView` | 文件夹同步：预置文件夹同步（新建/编辑/运行/删除；「您可以为文件夹同步添加预置，并可以从工具栏项目“预置文件夹同步”快速打开文件夹同步。」） |
| 13 | `quick_locations` | `JHSQuickLocationSettingsView` | 快捷位置：「快捷位置可以简化地址栏中的位置显示。」「快捷位置可用作右键菜单中“移动到…”、“复制到…”或“解压到…”的目标。」「快捷位置支持自定义快捷键。」「将最近位置添加到 列表开头/列表末尾/关闭」「将外部磁盘添加到 …」列表列（名称/位置/地址栏/聚焦搜索/目标/快捷键/显示菜单项图标） |
| 14 | `batch_rename` | `JHSBatchRenameSettingsView` | 批量重命名：启动模式（简洁/高级）、按下回车确认重命名、日志记录、预置、格式（`$n` / `($n)` / `_$n`）、替换文本、添加文本、「在高级模式下，您可以将重命名规则保存为预置。并在右键菜单项“快速重命名”中执行预置。」 |
| 15 | `custom_icons` | `JHSCustomIconSettingsView` | 自定义图标：「您可以添加“icns”，“png”或“jpg”图片作为自定义图标模板，通过右键菜单项“自定义图标”设置文件夹和文件的显示图标。」「无边框图标」清单；表列（图标/灰度/操作） |
| 16 | `palette` | `JHSPaletteSettingsView` | 调色板：「可用于边栏项目强调色或窗格背景色的颜色列表。」「＋ 中国色」「＋ 系统色」「自动调整颜色以适应深色外观」 |
| 17 | `file_color` | `JHSFileColorSettingsView` | 着色：「按规则为文件和文件夹着色」「着色规则互斥」「选择项目时忽略」「附加条件」「背景/文本」色，属性（名称/大小/种类/UTI）+ 运算符（=、包含、前缀、后缀、正则…见 `BIN` `equal/greater/…/match_regex/be_in`） |
| 18 | `open_mode` | `JHSOpenModeSettingsView` | 打开模式：替换访达（设置/恢复命令，两条 `defaults write` 命令可一键拷贝）、访达扩展（「选择QSpace后，在第三方应用中调用“在访达中显示”时，QSpace会替代访达显示。」）、从外部打开（打开到、优先在已打开的工作区中显示、在 QSpace 桌面上使用自定义右键菜单与快捷键）、打开&保存面板、活动文件夹、在外置磁盘上启用、桌面（点击墙纸显示桌面、文件夹显示模式） |
| 19 | `archive` | `JHSArchiveSettingsView` | 归档（最全的一页，见 10.4） |
| 20 | `functions` | `JHSAppExtensionsSettingsView` | 功能（付费扩展）：账号（登录/购买/试用，$ 7.99）、功能列表（`BIN` 键 `extensions.stash_shelf / extensions.advanced_batch_rename / extensions.server_connections / extensions.enhanced_archiver / extensions.professional`；`LS: Extension → 扩展功能`） |
| 21 | `icloud` | `JHSiCloudSettingsView` | iCloud云盘：在 iCloud云盘 中显示应用文件夹（自动/自定义隐藏项/自定义可见项） |
| 22 | `invitations` | `JHSInvitationsSettingsView` | 邀请：申请邀请码、奖励规则、余额/今日/可提现/总收益、提现、收益记录（时间/状态/收益列） |
| 23 | `app_version` | `JHSVersionSettingsView` | 版本：更新（检查更新/现在升级/稍后）、新版本通知、Beta（加入Beta计划/切换到正式版）、更新日志、`QSpace Pro` + 版本行 |

> 另有 `JHSPreferencesExportController` / `JHSPreferencesImportController`（**备份配置 / 恢复配置**，即导入导出，22 类逐项：基本设置/书签/桌面/连接/地址栏/快捷启动/快捷键/右键菜单/新建文件/批量重命名/着色/调色板/自定义图标/搜索/工作区/快捷位置/工具栏/视图样式/外观/使用习惯/打开模式/归档，每类三态 **忽略/合并/覆盖**，另有 **全合并/全忽略/全覆盖**）—— 与 `BIN` 里另一个 22 项枚举（`general, bookmarks, desktop, connections, addressbar, quick_launch, hotkey, context_menu, new_file, batch_rename, file_color, palette, custom_icon, search, workspaces, quick_locations, toolbar, view_styles, appearance, behaviors, open_mode, archive`）一一对应，可证其为**导入导出分类**而非导航分类。

### 10.3 「使用习惯（behaviors）」14 个分组（`XS:JHSBehaviorSettingsView` 表头，逐字）

**应用与系统 · 拷贝与粘贴 · 显示 · 文件操作 · 隐藏文件 · 键盘 · 鼠标按钮操作 · 鼠标与触控板 · 导航 · 排序 · 暂存架 · 标签页 · 任务 · 窗口与工作区**

代表行（逐字）：退出应用时，提示确认 / 操作音效 / 音效版本 / 在徽标上显示任务进度 / 限制并行任务 / 批量文件操作（超过 5/10/20/50 项时，提示确认 / 无需确认）/ 将剪贴板中的图像和文本粘贴为文件 / 拷贝路径（始终用引号括起来、使用双引号、多行、编码拷贝 URL、Windows 模式、OS X 模式、自动转义）/ 标记剪切项 / 文件名过长（适应文件名/有限度适应文件名/省略中部/省略尾部）/ 单击文件名重命名所选项目 / 双击空白处打开上层文件夹 / 点按非活跃窗格时，仅激活窗格 / 按空格键选择项目 / 按下 Enter / 按下 Backspace / 按下 Delete / 按下 Forward Delete / 按下 ESC（打开/取消选择/前往上层文件夹/默认取消）/ 键盘选择（自动标记下一项、匹配非ASCII字母的首字符（比如“zg”可匹配“中国”））/ 比较数字 / 比较多语言数字 / 按类型排序时，相同类型按扩展名排序 / 保持列表视图展开项 / 自动隐藏暂存浮窗 / 双击标签栏，关闭标签页 / 新建标签页位置（当前标签页之后/…）/ 首选标签页 / 自动跳转到新标签页 / 新建标签页时，复制当前标签页 / 以打开时间为序，关闭最早打开的标签页。 / 窗口标题 / 打开或激活工作区时，将工作区窗口移至当前桌面空间。/ 跟随当前桌面 / 拖放项目操作时，提示确认 / 同磁盘时移动，跨磁盘时复制 / 悬停时打开文件夹 / 滑动选择 / 拖拽晃动手势 / 轻扫切换页面 / 限制并行任务 / 预览时可直接编辑 / 创建 PDF 的页面顺序 / 拷贝路径…（见 10.3 原文）

### 10.4 「归档（archive）」页（`XS:JHSArchiveSettingsView`，逐字）

表头：**创建归档 / 打开归档 / 解压后 / 归档后 / 存储位置 / 文件类型 / 格式 / 一键压缩 / 切为分卷 / 密码列表 / 打开方式 / 忽略项 / 忽略根文件夹**
行项：**ZIP / 7Z / rar, zip / 最快 · 更快 · 普通 · 更好 · 最好 · 存储 / 固实压缩 / 质量 / 加密 / 修改密码 · 添加密码 · 编辑密码 / 自动保存输入的密码 / 自动尝试列表中的密码 / 限制密码数量 / 保留压缩包 · 将压缩包移至废纸篓 · 保留原文件 · 将已被压缩的原文件移到废纸篓 / 确保创建包裹文件夹 / 只有一个文件时不创建包裹文件夹 / 压缩单文件时省略原扩展名 / 可直接在列表视图中展开 / 可直接在分栏视图中展开 / 可展开的最大文件大小 / QSpace 解压 · QSpace 预览 · 默认应用 / 忽略临时文件（.DS_Store、__MACOSX）/ 忽略 .git 文件夹 / 忽略 .svn 文件夹 / 忽略隐藏文件和文件夹**
相关命令：**压缩 · 单独压缩 · 解压 · 解压到... · 一键压缩**（`XS:JHSCompressViewController`：**「开启一键压缩」「请输入压缩名称」「单独压缩」「压缩」「位置」**；`BIN` 键 `archive_oneclick_mode`、`archive_format`（本机 327680 = ZIP）、`archive_level`（本机 3）、`archive_solid_mode`、`archive_passwords_max`…）。
另有独立页 `JHSCompressionSettingsView`（**归档方法**页内子面板）：**体积小/速度快/保持/普通/更快/更好/最好/最快/自定义 · 固实压缩（仅支持 7Z 格式）· 忽略 .git 文件 · 忽略 .svn 文件 · 忽略隐藏文件 · 忽略临时文件 · 归档后将原始文件移至废纸篓 · 切为分卷（大小）： · 存储 · Add Password/Change Password**（`XS:JHSPreferencesWindowController` 的 **「归档方法：」** 即此处，本机值 `Zip`）。

### 10.5 其余 62 个 strings 文件（非设置页的控制器/窗口，一行一个）

| strings 文件 | 用途（由其文案判定） |
|---|---|
| `AcknowledgementsWindowController` | 致谢页（`XS:JHSAboutWindowController` 里也有 **致谢**） |
| `InfoPlist` | Info.plist 中文权限描述（桌面/文稿/下载/宗卷/照片/AppleEvents） |
| `JHSAboutWindowController` | 关于页：官方网站 / 隐私政策 / 隐私政策更新通知 / 致谢 / `Copyright © 2019-2026 Tian Wenda.` / `QSpace` |
| `JHSAccountBindingController` | 账号绑定（邮箱地址/验证码/获取/登录） |
| `JHSActivationController` | 激活页：开启QSpace🚀 / 立即购买 / 功能简介 / 兑换 / 免费试用 / 已有账号？ |
| `JHSAddPasswordViewController` | 压缩密码添加（输入密码/确认密码/加密文件名（需要 7z 格式）/清除） |
| `JHSAppDownloadController` | 应用下载（内购功能的组件下载） |
| `JHSAppUpdateController` | 发现新版本 / 新版本提醒 / 现在升级 / 稍后 |
| `JHSBatchRenameController` | 批量重命名主窗（名称/扩展名/序号/日期/格式/名称处理/替换文本/添加文本/转大写/转小写/步长/加载预置/保存预置/执行重命名/日志） |
| `JHSBatchRenameLiteController` | 快速重命名小窗（添加文本/替换文本/前缀/后缀/格式/高级模式/重命名/序号变量说明） |
| `JHSBatchRenameLogController` | 批量重命名日志（复用其中规则/删除） |
| `JHSBatchRenameSavePresetController` | 保存预置（请输入预置项名称/保存/取消） |
| `JHSChangeEmailController` | 更改邮箱 |
| `JHSCompressViewController` | 一键压缩弹窗（开启一键压缩/压缩名称/单独压缩/位置） |
| `JHSConvertImageViewController` | 转换图像（格式/质量/大小/缩放 1/4…8x/保留元数据/转换） |
| `JHSCustomHiddenItemsViewController` | 自定义隐藏文件（每行一个，支持通配符 * 和 ?） |
| `JHSDesktopOptionsViewController` | QSpace 桌面选项（显示硬盘/显示外置磁盘/显示已连接服务器/显示隐藏文件/显示文件大小/显示小组件/透视文件夹/文件夹置顶/对齐/行间距/列间距/图标大小/文字大小/标签位置/排序方式/叠放方式/预览图标/显示桌面文件夹内容） |
| `JHSEditQuickLauncherController` | 编辑快捷启动项（名称/类型=App·命令·快捷指令·打开文件/启动参数/环境变量/图标；变量 `$selections / $workspace_root / $selections_or_root / $stash_items / $selected_filenames`） |
| `JHSEnterInvitationViewController` | 输入邀请码 |
| `JHSEnterPasswordView` | 解压密码输入（文档已加密，请输入密码：/正在搜索密码...） |
| `JHSFeedbackWindowController` | 反馈（邮件反馈 / 加入电报群 / 加入 QQ 群 / 扫码） |
| `JHSFileHashController` | 文件哈希值（MD5 / SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512 / CRC-32，大小写，输入哈希值进行比较） |
| `JHSFileInfoView` | 简介面板（名称与扩展名/通用/修改时间/预览/注释/所在组/标签添加/权限（所有者、可读可写可执行、已锁定）/打开方式（含使用Rosetta打开）/更多信息） |
| `JHSFileOperationConflictWindowController` | 文件操作冲突（跳过/替换/合并/保留两者/停止/全部应用/Name(Target)/Property） |
| `JHSFolderStyleSettingsViewController` | 文件夹显示样式（显示/Display Style/Set Folder Individually/Follow Workspace/Apply to descendant folders） |
| `JHSFolderSyncFilterController` | 同步过滤器编辑（包含/排除/名称/类型/文件/文件夹/起始为/结尾是/等于/区分大小写） |
| `JHSFolderSyncPresetController` | 同步预置编辑（预置名称/更新左边/更新右边/更新两者/容差/过滤/包含隐藏项目/预览同步详情） |
| `JHSFolderSyncProgressController` | 同步进度（取消） |
| `JHSFolderSyncViewController` | 同步执行窗（更新左边/右边/两者/同步/容差/过滤/包含隐藏项目/重新加载/输入地址...） |
| `JHSInputExtensionsViewController` | 扩展名清单编辑（以下扩展名的文件，作为压缩包处理：/逗号分割/重置/确认） |
| `JHSKeyboardAuthController` | 键盘/辅助功能授权 |
| `JHSLockLicenseAlertController` | 锁定许可证提示 |
| `JHSMPQRCodeController` | 手机扫码（MPQRCode.png） |
| `JHSMatchAndSelectController` | 项目选择器（按条件选择：名称/修改日期/创建日期、包含/开头为/结尾是/正则、今天/昨天/本周/上周/本月/上个月/近两周/近两月、文件/文件夹、追加/移除/选择/自动关闭） |
| `JHSNewfileExpressionTipsViewController` | 新建文件日期表达式示例 |
| `JHSPasswordListViewController` | 密码列表（每行一个） |
| `JHSPathSegmentPopViewController` | 地址栏路径段弹出（权限设置） |
| `JHSPreferencesExportController` | 备份配置（导出 22 类，见 10.2 末） |
| `JHSPreferencesImportController` | 恢复配置（导入 22 类，忽略/合并/覆盖） |
| `JHSPreferencesSideViewController` | 设置侧栏（General / 新版本） |
| `JHSPreferencesWindowController` | 设置窗口主体（约 128 条设置行文案，含默认工作区/归档方法/打开方式/快捷键/右键菜单开关等） |
| `JHSProductAliwxPayViewController` | 支付宝/微信支付 |
| `JHSProductPayPalViewController` | PayPal 支付 |
| `JHSProductRedeemController` | 兑换码 |
| `JHSRemoteCommandViewController` | 远程命令（在远程服务器上执行命令） |
| `JHSSearchController` | 搜索窗（标题 **搜索**） |
| `JHSSearchViewController` | 搜索条件（属性/内容/种类：/标签：/名称/聚焦搜索/All authorized folders） |
| `JHSServerDirtyFilesController` | 文件更新（本地缓存与服务器冲突：上传覆盖/下载更新/清理缓存/Local/Server） |
| `JHSShoppingProductsViewController` | 商品购买（￥35 / ￥198、支付宝或微信 / PayPal、邀请码、限时折扣、应付金额） |
| `JHSSidebarView` | 边栏视图本体（过滤占位「过滤」、购买按钮、12 GB 等容量行） |
| `JHSSpaceIconsViewOptionsController` | 图标视图选项（见 5.4） |
| `JHSSpaceListView` | 列表视图 cell（大图标等） |
| `JHSSpaceListViewOptionsController` | 列表视图选项（见 5.4） |
| `JHSStashShelfPopViewController` | 暂存架弹出（移出暂存架/查看项目） |
| `JHSStashShelfView` | 暂存架视图（**暂存架** 标题 + 计数） |
| `JHSSyncSelectController` | 同步选择（11 条，见 §7.2） |
| `JHSTaskListViewController` | 任务列表（终止全部任务 / `Copying...` / `102M/240MB, 5MB/sec`） |
| `JHSTextProcessorController` | 文本处理器（替换/移除/截取/添加、正则、区分大小写、大小写转换 6 种、范围、手动输入、一行一个名称、加载） |
| `JHSViewStyleManagerController` | 视图样式管理（视图样式/样式/删除） |
| `JHSWorkspacesPopViewController` | 工作区弹出（保存当前工作区/创建新工作区/删除选择的工作区/`⌘1`） |
| `JHSiCloudSettingsView` | iCloud 设置（见 §6.3） |
| `Localizable` / `MainMenu` / `ServicesMenu` | 全局 / 主菜单 / 服务菜单（见 §0.1） |

> 87 个文件已全部覆盖：23 个设置页（10.2）+ 2 个导入导出 + 3 个菜单级（Localizable/MainMenu/ServicesMenu）+ InfoPlist + 58 个控制器/窗口（上表），另有 `JHSLayoutPickerViewController.nib` / `JHSGotoBookmarkController.nib` / `JHSEditBookmarkViewController.nib` / `JHSTagViewController.nib` 等 **nib 存在但无 strings 文件**（其文案来自 `LS` 或代码）。

---

## 11. 文件操作能力全集

> 只列 `strings` / `MainMenu` / `BIN` 里真实存在的能力；每条给中文原文与出处。子菜单/确认框已在前面章节的，这里给指针。

### 11.1 命令 id 全表（`com.jinghaoshe.qspace.*`，`BIN` 共 200+ 条，按域分组照抄）

**布局/窗格**：`apply_layout_0…11`、`layout_split_horizontally`、`layout_split_vertically`、`move_view_to_above/below/left/right`、`move_view_to`、`move_focus_to_above/below/left/right`、`increase/decrease_pane_width`、`increase/decrease_pane_height`、`maximize_pane`、`minimize_pane`、`pane_tab_bar`、`layouts`、`layouts_expanded`

**视图/排序/分组**：`as_icons_view`、`as_list_view`、`as_columns_view`、`viewtypes`、`show_view_options`、`visible_columns`、`sort_by`、`sort_by_name/kind/size/date_created/date_modified/date_added/date_last_opened/tags/dimensions/duration`、`sort_change_direction`、`group_by`、`group_by_none/kind/extension/size/date_modified/date_added/date_created/date_last_opened/application/tags`、`zoom_in`、`zoom_out`、`refresh_view`、`hidden_files`、`individual_folder_settings`、`remove_folder_settings`

**文件操作**：`open`、`open_with`、`always_open_with`、`open_in_editor`、`open_in_terminal`、`open_in_browser`、`quicklook`、`instant_slideshow`、`rename`、`quick_rename`、`duplicate`、`copy`、`cut`、`paste`、`multiple_paste`、`move_copied`、`trash`、`remove`、`remove_others`、`trash_others`、`put_back`、`empty_trash`、`touch`（更新时间戳）、`show_package_contents`、`show_original`、`make_alias`、`make_symlink`、`make_hard_link`、`calculate_size`、`file_hash`、`comments`、`getinfo`、`show_inspector`、`set_item_icon`、`export_directory_tree`、`compress`、`compress_separately`、`decompress`、`decompress_to`、`flatten_folder`、`folder_sync`、`folder_sync_presets`、`convert_image`、`convert_to_pdf`、`create_pdf`、`remove_background`、`rotate_left/right`、`flip_horizontal/vertical`

**新建**：`newfile`、`newfolder`、`new_folder_with_selection`

**标签/选择**：`tags`、`edit_tag`、`add_tag_1…7`、`select_all`、`invert_selection`、`select_by_condition`、`select_same_type`、`select_sync`

**路径/定位**：`copy_path`、`copy_path_for_terminal`、`copy_path_for_windows`、`copy_filename`、`copy_url`、`show_in_finder`、`show_in_enclosing_folder`、`finder_go_current_location`、`go_back`、`go_forward`、`go_enclosing_folder`、`go_home`、`go_desktop`、`go_documents`、`go_downloads`、`go_applications`、`go_utilities`、`go_icloud_drive`、`go_to_start_location`、`go_to_start_location_all_panes`、`go_to_location`、`go_to_path`、`go_to_bookmark`、`start_path`（回到起始位置）、`recent_locations`、`recent_files`、`bookmark`

**窗格显示/移动**：`show_in_view`、`show_in_above/below/left/right_view`、`show_in_new_tab`、`show_in_new_window`、`copy_item_to_view`、`copy_item_to_here`、`copy_item_to_above/below/left/right_view`、`move_item_to_view`、`move_item_to_here`、`move_item_to_above/below/left/right_view`、`move_copied`

**侧栏/界面**：`sidebar`、`sidebar2`、`filter_sidebar`、`toolbar`、`status_bar`、`address_bar`、`tab_bar`、`tab_overview`、`toggle_side_preview`、`toggle_pane_side_preview`、`right_preview`、`bottom_preview`、`toggle_preview_edit`、`pintop`、`fullscreen`、`eject`、`eject_all_external_disks`、`eject_all_dmgs`、`disconnect`、`disconnect_all_servers`、`connect_to_server`、`clear_stash`、`remove_stash`、`add_stash`、`move_stash_items_here`、`copy_stash_items_here`、`floating_stash_shelf`、`spotlight_search`、`spotlight_search_in_current_location/workspace`、`search`、`task_status`、`share`、`share_airdrop/mail/messages/qq/wechat/add_to_photos/cloud_sharing`

**标签页/窗口/工作区**：`close`、`close_all`、`new_workspace_tab`、`new_workspace`、`duplicate`（标签页 `onMenuItemDuplicateTab`）、`show_tab_1…9`、`show_next_tab`、`show_previous_tab`、`cycle_recently_used_tabs(_reverse)`、`move_tab_to_new_window`、`merge_all_windows`、`minimize_window`、`zoom_window`、`bring_all_to_front`、`workspace_list`、`workspace_name`、`activate_workspaces`、`delete/clone/clone_current_workspace_to_tab`、`reopen_last_closed_workspace`、`quick_locations`、`quick_launch`、`save_view_style`、`context_menu`、`actions`、`backforward`、`current_folder`

**编辑/杂项**：`undo`、`redo`、`print`、`save`、`quit`、`show_desktop`、`hide_desktop`、`remove_from_desktop`、`set_as_desktop_background`、`change_desktop_background`、`float_trash_can`、`show_trash_can`（注意原始 id 为 `qspacce` 拼写变体）、`separator`、`services`、`none`、`runCommand`

**云盘专用**：`keep_downloaded`、`remove_download`、`download_now`、`qspace.onedrive.copy_shared_link/view_online`、`com.dropbox.qspace.copy_shared_link/view_online`、`qspace.googledrive.copy_shared_link/view_online`

**系统/内部**：`admin.privileged-operation`、`file-session-admin-query`、`file-session-cleanup`、`archive-preview-cleanup`、`op-recorder`、`pro.helper`、`system-preferences`、`QSpaceWindowToolBar`

### 11.2 按能力域的中文清单

| 能力 | 中文原文（`LS`/`MM`） | 命令/出处 |
|---|---|---|
| **拷贝 / 移动** | 拷贝 · 剪切 · 粘贴 · 复制 · 移动 · 拷贝%@个项目 · 剪切%@个项目 · 复制%@个项目 · 移动%@个项目 | `copy/cut/paste/duplicate`，`MM` Edit |
| **冲突处理** | 跳过 · 替换 · 合并 · 保留两者 · 停止 · 全部应用 · 全部忽略 · 全部覆盖 · 全合并 · 保持当前 · 询问 | `XS:JHSFileOperationConflictWindowController` |
| **压缩** | 压缩 · 单独压缩 · 压缩“%@” · 压缩%@个项目 · 单独压缩%@个项目 · 创建归档 · 一键压缩 | `compress(_separately)`、`MM` |
| **解压** | 解压 · 解压到... · 解压选择归档 · 无法完成解压“%@”。 | `decompress(_to)`、`MM` |
| **重命名** | 重命名 · 快速重命名 · 批量重命名 · 在 QSpace Pro 中重命名（服务） | `rename/quick_rename`、`ServicesMenu` |
| **标签** | 添加标签 · 编辑标签… · 标签… · 添加标签 1–7 · 移除“%@” · 将标签分配给 %d 个项目 | `tags/edit_tag/add_tag_1…7` |
| **简介 / 注释** | 显示简介 · 多个项目简介 · “%@”简介 · 注释 · %d个项目的注释 · 拷贝摘要信息 | `getinfo/comments` |
| **校验 / 哈希** | 计算哈希值 · 比较哈希值 · 移除哈希值 · 文件哈希值（MD5/SHA-1/224/256/384/512/CRC-32）· 哈希值相等/不相等 · 计算大小 · 正在计算… | `file_hash/calculate_size`、`XS:JHSFileHashController` |
| **同步** | 同步浏览 · 同步选择（仅双窗格）· 复制到右边/左边 · 移动到右边/左边 · 更新左边/右边/两者 · 文件夹同步 · 预置文件夹同步 · 同步已完成。 | §7.2 |
| **暂存架** | 添加到暂存架 · 移出暂存架 · 清理暂存架 · 将暂存项移动/复制到此处 · 浮动暂存架 | `add/remove/clear_stash…` |
| **终端 / 编辑器 / 浏览器** | 在终端打开 · 在编辑器打开 · 在浏览器打开 · 打开终端 · 快捷指令 · 命令行 · 运行面板 | `open_in_terminal/editor/browser` |
| **打开方式** | 打开方式 · 始终以此方式打开 · 其他… · （当前关联）· 使用Rosetta打开 · 在预览中编辑 | `open_with/always_open_with` |
| **废纸篓** | 移到废纸篓 · 将%@个项目移至废纸篓 · 直接删除 · 直接删除其他项 · 放回原处 · 清倒废纸篓… · 显示废纸篓 | `trash/remove/put_back/empty_trash` |
| **隐藏** | 隐藏 · 取消隐藏 · 显示隐藏文件 · 关闭隐藏文件 · 彻底隐藏文件 · 自定义隐藏文件 | `XS:JHSCustomHiddenItemsViewController` |
| **权限 / 锁定** | 权限设置 · 读与写 · 锁定 · 解锁 · 已锁定 · 完全磁盘访问权限 · 授权 | `JHSPathSegmentPop…`、权限页 |
| **图像 / 媒体** | 转换图像 · 创建PDF · 转为PDF · 移除背景 · 向左/向右旋转 · 水平/垂直翻转 · 设为桌面背景 · 更改桌面背景… | §3.1 H |
| **云 / 网络** | 连接服务器 · 断开 · 断开所有服务器 · 上传 · 下载 · 现在下载 · 保留下载 · 移除下载项 · 拷贝共享链接 · 在线查看 · 缓存到本地 | §6.3/§6.7 |
| **任务** | 任务状态 · 终止全部任务 · 等待输入 · 正在复制… · 102M/240MB, 5MB/sec · 限制并行任务 | `task_status`、`XS:JHSTaskListViewController` |
| **配置** | 备份配置 · 恢复配置 · 导入 · 导出… · 从“模型”页导入（归档方法） | `XS:JHSPreferences*` |
| **搜索 / 选择** | 聚焦搜索 · 在当前位置聚焦搜索 · 在当前工作区聚焦搜索 · 按条件选择 · 选择相同类型 · 反向选择 · 同步选择 · 在子文件夹中搜索 | `MM` Edit/Go |
| **导出** | 导出目录树… · 导出… | `export_directory_tree` |

---

## 12. 与 HTML 原型的还原差距 checklist

> 对照对象：`app.js` §34/§35/§36 访达段（`setFinderOpen` 6482、`renderFinder` 6492、`renderFinderSide` 6559、`fpPathRowHTML` 6501、`fpStartPathEdit` 6529、`fpGroupMenu` 6721、`fpFavoriteSub` 6786、`fpAddressMenu` 6802、`renderFinderMain` 6822、`fpCellHTML` 7021、`fpRowMenu` 7151、`fpBlankMenu` 7181、`fpColumnMenu` 7103、`fpSorted` 6992、twisty 6924）。
> 状态标记：✅ 原型已做 · ⚠️ 做了但与 QSpace 不符 · ❌ 缺失

| # | QSpace 有（本报告出处） | 原型现状 | 还原要点 |
|---|---|---|---|
| 1 | **右键菜单 = 可配置清单**（§3.0：功能/服务/快捷启动/视图样式 拖拽启用、分隔符、访达模式、显示图标、显示选择项） | ❌ 原型三套菜单是写死数组（`fpRowMenu` 7151、`fpBlankMenu` 7181） | 需要"菜单项清单 + 拖拽排序 + 访达样式切换"的数据结构；至少把「菜单项数组」提成配置，才能谈 1:1 |
| 2 | **文件右键**：打开/打开方式/快速查看/幻灯片/收藏/拷贝/复制/拷贝路径/拷贝文件名/重命名/批量重命名/压缩/解压/移到废纸篓/显示简介/标签 + 在编辑器/终端打开 + 拷贝到·移动到·在…窗格显示 子菜单（§3.1） | ⚠️ `fpRowMenu`（7151–7179）有 17 项，含 打开/打开方式/快速查看/收藏/拷贝/复制/拷贝路径/拷贝文件名/重命名/批量重命名/压缩/解压/移到废纸篓/显示简介/添加标签 | 缺：**在编辑器打开、在终端打开、在浏览器打开、幻灯片放映、查看包内容、显示原身、制作替身/符号链接/硬链接、注释、计算大小/哈希、自定义图标、设为桌面背景、添加到暂存架、在上层文件夹中显示、复制到/移动到…子菜单、在新标签页/新窗口打开**；子菜单层级（打开方式 ›、标签 ›、收藏 › 的实际形态）需按 §3.1 分段重排 |
| 3 | **文件夹右键**：新建文件夹、用所选项目新建文件夹、展开/折叠全部文件夹、单独设置文件夹、文件夹同步、解散/合并文件夹、设为起始位置（§3.2） | ❌ 原型文件夹与文件共用同一菜单 | 需按 kind 分叉，补 §3.2 全部项 |
| 4 | **空白区右键**：新建文件夹 · 新建文件› · 粘贴（含"粘贴到 N 个文件夹"）· 显示/关闭隐藏文件 · 排序方式› · 分组› · 设为/取消起始位置 · 始终按文件名排序 · 复制/移动到另一窗格 · 刷新 · 解压到… · 服务› · 显示简介（§3.3 段内实证） | ⚠️ `fpBlankMenu`（7181–7206）有 新建文件夹/新建文件›/粘贴/排序方式›/刷新/显示简介，6 项 | 补：显示隐藏文件、分组子菜单、起始位置三项、到另一窗格、解压到…、服务、**粘贴确认三种（移动/复制/替身）**；`新建文件›` 的子菜单要换成 §4 的真实模板清单（文本.txt/Bash.sh/HTML.html/Swift.swift/python.py/As.applescript/分隔符/批量创建文件夹.py，而非 纯文本/Markdown/…） |
| 5 | **地址栏右键 / 路径段弹出**：权限设置、解压到…、拷贝路径（含终端/Windows 变体）、拷贝URL、前往路径、前往地址、添加/移除书签（§3.6） | ⚠️ `fpAddressMenu`（6802–6820）只有 拷贝路径/编辑地址/粘贴并前往/刷新该窗格 | 「编辑地址」「粘贴并前往」**QSpace strings 无此 key**（原型自创）；应改为 拷贝路径三条 + 拷贝URL + 前往路径/地址 + 书签 + 权限设置（段弹出）+ 刷新。**单击段落跳转**已有（`fpBindPathRow` 6511）；缺段展开按钮/悬停展开（`address_segment_auto_expand`）与地址栏位置在顶/底切换 |
| 6 | **侧栏分组右键**：新建分组/移除分组/添加分隔符/移除分隔符/编辑显示名称/分配到同侧窗格（§3.5） | ⚠️ `fpGroupMenu`（6721–6737）：重命名（编辑）/添加条目…/展开折叠/删除分组 | 缺 **添加分隔符、移除分隔符、编辑显示名称（QSpace 用词）、分配到同侧窗格**；「重命名（编辑）」应改叫 **编辑显示名称**；「删除分组」的确认文案要换成 **「立即删除此分组及其下项目。此操作无法被撤销。」** |
| 7 | **侧栏条目右键**：编辑显示名称/移除书签/从边栏移除/在上层文件夹中显示/复制到标签页/**推出（+推出全部外部磁盘/安装包/只从边栏隐藏）**/断开服务器/在新标签页·新窗口打开（§3.4） | ❌ 原型条目只有点击导航 + 拖动，**无右键菜单** | 需新增条目右键；磁盘条目必须有 **推出三选**（推出 / 只从边栏隐藏 / 推出该盘全部卷）与其确认文案 |
| 8 | **收藏（书签）**：文件右键「收藏›」到各分组 + 不分组 + 新建分组并收藏；侧栏书签区；工具栏书签组按钮；添加/移除书签；`Add a bookmark` 确认（§3.1/§6.5/§6.6） | ⚠️ `fpFavoriteSub`（6786–6799）已有"到分组「x」/不分组/新建分组并收藏" | 缺：**移除书签**（条目右键）、**书签星标（`JHSPathFavoriteButton`）在地址栏上**、**工具栏书签组按钮**（`bookmark-group:<id>`）、拖入确认「你想要将“%@”添加为书签吗?」、**记住书签状态** |
| 9 | **磁盘（位置区）**：硬盘/外置磁盘分区显示、容量、自动隐藏推出按钮、显示磁盘可用空间、Eject 系列与确认（§6.1/§6.2） | ⚠️ `FP_DEFAULT_SIDE`（6389–6394）只有"位置"三行演示数据（Macintosh HD/ExtSSD-Backup/U盘-DATA），无推出按钮/容量/分组（硬盘 vs 外置磁盘） | 需拆成 **硬盘 / 外置磁盘 / 时间机器备份** 分区（或按 type=3 的组），行上加**推出按钮（可自动隐藏）**与容量行、确认弹窗文案 |
| 10 | **iCloud 分区**：iCloud云盘、与我共享、应用文件夹三态（自动/自定义隐藏项/自定义可见项）、云条目"保留下载/移除下载/现在下载/始终保留在此设备上"（§6.3） | ⚠️ `FP_DEFAULT_SIDE` 里 `icloud` 组只有两行路径 | 缺应用文件夹三态设置与云条目右键项；iCloud 图标 `icon_icloud_small.tiff` |
| 11 | **侧栏分区全集**：位置/常用/书签/服务器/标签/iCloud/外置磁盘/硬盘/时间机器/最近位置/最近文件/访达收藏/快捷位置/暂存架/工作区/智能文件夹 + 分隔符（§6.1） | ⚠️ 原型只有 收藏/分组 + 位置 + iCloud + 标签 + 最近 五个演示组 | 按 §6.1 type 表补齐分区与顺序（`sidebar.conf` 数组顺序即显示顺序），加**分隔符条目**与分区折叠记忆 |
| 12 | **列头右键 = 显示列勾选**（25+ 列）+ 排序（§3.7/§2.4） | ⚠️ `fpColumnMenu`（7103–7125）11 列 + 多媒体›/其他› 两级 + 恢复到默认/设置为默认 | 原型是 Finder 照片的 11 列；QSpace 列全集是 §2.4 的 26 项（含 行号/链接数/子项数/群组/权限/帧速率/比特率/采样率/音频通道/宽度/高度…），**且默认是 Name/Size/Date Modified/Date Added**；「设置为默认/恢复到默认」对应 `用作默认` 与视图选项，措辞要统一 |
| 13 | **标签页右键**：关闭标签页/关闭其他/关闭左侧/关闭右侧/复制标签页/固定/取消固定/移到新窗口/下一个/上一个/最近使用循环/新建标签页/回到起始位置（§3.8） | ❌ 原型无窗格标签栏 | 需先做**窗格标签栏**（含加粗当前标题/彩色图标/胶囊样式/关闭按钮/固定样式设置），再挂这张菜单 |
| 14 | **视图模式**：为图标/为列表/为分栏 + 视图样式（保存/管理/应用/绑快捷键）+ 查看显示选项⌘J（§5.1） | ⚠️ `#fpViews` 三按钮（`bindFinder` 7214）已有三视图 | 缺 **视图样式**（可命名保存的一整套视图+排序+分组+列，可绑快捷键）与 **⌘J 查看显示选项**弹层；分栏视图原型是"左子目录+右内容"两列（`fpCellHTML` 7024），QSpace 是**多列钻取**（`JHSSpaceColumnsSplitView`） |
| 15 | **排序**：10 个排序字段 + 升降序 + 改变方向 + 文件夹置顶 + 始终按文件名排序 + 同类型按扩展名（§5.2） | ⚠️ `fpSorted`（6992）只有 name/size/mtime/added 四键 + 目录恒前 | 补：种类/创建日期/上次打开日期/标签/尺寸/持续时间；**升降序是独立菜单项**（不只点表头）；「按类型排序时相同类型按扩展名排序」开关 |
| 16 | **分组**：不分组/种类/扩展名/大小/修改日期/添加日期/创建日期/上次打开日期/应用程序/标签（§5.3） | ⚠️ `FP_GROUP_OPTS`（6386）5 项：不分组/种类/名称首字母/添加日期/修改日期 | 差 5 项；且 QSpace **没有"名称首字母"这一组**（多出来的），有 扩展名/大小/创建日期/上次打开日期/应用程序/标签 |
| 17 | **文件树折叠**：列表内 twisty 原地展开、每窗格 `expands` 持久化、展开/折叠全部文件夹、保持列表视图展开项、压缩包/应用包可展开（§8） | ✅ twisty（6924–6935）+ `pane.expanded` + `fpCellHTML` 树形 flatten（7054–7068） | 原型已对齐主干；缺：**展开集合持久化**（QSpace 存进 workspace 的 `expands`）、**展开/折叠全部文件夹**两个动作、**压缩包/应用包当文件夹展开**、分栏视图里的树 |
| 18 | **分屏**：14 种布局（含 3×4 与左右/上下分割）+ 中缝拖拽比重 + 窗格移动/焦点/增减宽高/最大化/最小化 + 布局快捷键 ⌥⌘1–8（§7.1） | ⚠️ `FP.layout` 4 种：single/h2/v2/three/quad（`renderFinderMain` 6832–6837）+ 中缝拖拽（6849） | 缺 8 种（左1右2/左2右1/上1下2/上2下1/3行/3列/4列/4行 + 水平/垂直分割动作）；缺**窗格级操作**（移到上/下/左/右、焦点移动、增减尺寸、最大化/最小化）与对应快捷键 |
| 19 | **窗格间拖拽**：移动/复制/替身三态确认、同盘移动跨盘复制、悬停进文件夹（可调速）、滑动选择、晃动手势、拖到标签栏换位（§7.3） | ⚠️ `fpMoveEntry`（6766）只有"落点=目录就移动"，行 drop（6908）、空白 drop（6953）、侧栏收藏 drop（6616） | 缺：**移动/复制/替身 三态与确认文案**（`Do you want to move/duplicate/make item aliases here?`）、**悬停进文件夹**（含速度）、**滑动选择**、拖到窗格标签栏、目标已有同名时的 QSpace 确认（原型只 toast） |
| 20 | **同步浏览 / 同步选择**：窗格底部条按钮 + 同步选择（双窗格、11 个条件）+ 左右互拷命令（§7.2） | ❌ 无 | 需要**窗格底部条**（锁定位置/单独设置文件夹/同步浏览/注释/远程命令/信息密度滑杆），以及 Edit 菜单里的同步选择 |
| 21 | **地址栏**：元素可开关（返回前进/书签/刷新/搜索/前往上层/操作/显示所选项目）、位置在顶/底、过长折叠、段悬停展开、锁定窗格、权限设置（§2.2/§3.6/§7.4） | ⚠️ 只有面包屑 + 单击进输入（`fpPathRowHTML`/`fpStartPathEdit` 6501/6529） | 缺 6 个可开关元素与位置/折叠/悬停设置；「锁定当前窗格打开的位置」未做 |
| 22 | **工具栏**：23 项默认排布 + 可自定义（含书签组、布局面板、任务状态、聚焦搜索、废纸篓）+ 显示方式三态（§2.1） | ❌ 原型只有 `#fpViews`/`#fpLayouts`/`#fpGroupBtn`/`#fpSwap` 四组按钮 | 需按 §2.1 默认表搭真工具栏（返回前进/当前位置/视图/分组/操作/分享/标签/连接服务器/终端/编辑器/任务/搜索/废纸篓/工作区名/布局）+ 自定义面板 |
| 23 | **状态栏**：选择项大小开关、N 项/选择 M 项/可用空间；侧边状态栏（每窗格底条）（§2.5/§2.6） | ❌ 无 | 补两条栏（窗口底状态栏 + 窗格底条），文案照 §2.6 |
| 24 | **新建文件**：模板机制（名称/内容/模板文件/快捷键）+ 15 个随包文档模板 + 日期表达式 `$date(format)` + 菜单分隔符（§4） | ⚠️ `fpBlankMenu` 里 5 个硬编码类型（纯文本/Markdown/Shell/网页/Python） | 换成 §4.2 的真实清单与模板机制（含分隔符条目、`$date(format)`、模板文件选择、右键菜单展开开关） |
| 25 | **快捷键**：主/副两栏、全局/工作区/快捷启动/新建文件/快捷位置/服务/视图样式 七组、冲突提示、恢复默认（§9） | ❌ 原型只有 ⌘L 进地址输入（7232） | 至少补 §9.3 表里 36 个已绑定项（⌘1/2/3 视图、⌥1/2/3 排序、⌥⌘1–8 布局、⇧⌘R 重命名、⌘F 搜索、⇧⌘I 简介、⌘J 选项…） |
| 26 | **设置面板**：23 页分类（§10.2），含 右键菜单/地址栏/新建文件/归档/着色/调色板/自定义图标/文件夹同步/快捷位置/服务器连接/权限/功能/邀请/版本 | ❌ 原型无设置页 | 若原型要做设置页，直接按 §10.2 的 23 页与页内分组复刻；本机 `main.conf` 有 173 个设置键可当字段清单 |
| 27 | **暂存架**：浮动暂存架、添加/移出/清理/移动·复制到此处、侧栏开关（§6.8） | ❌ 无 | 新增浮动面板 + 五个命令 + 分享扩展语义 |
| 28 | **废纸篓**：显示/隐藏/浮动、清倒、放回原处、直接删除其他项、清倒确认（§3.9） | ❌ 无 | 侧栏或工具栏加废纸篓入口 + `put_back` |
| 29 | **搜索**：聚焦搜索（当前位置/当前工作区）、搜索语法（&/空格/-）、子文件夹开关、搜索结果右键、最近搜索（§10.2 #6、§3.9） | ❌ 无 | 需搜索栏 + 语法说明 + 结果行菜单 |
| 30 | **工作区**：工作区菜单（保存/新建/复制/删除/重命名/上次保存/上次全部/重新打开最近关闭）、工作区快捷键 ⌘1…、窗口/桌面跟随（§10.2 #1、`XS:JHSPreferencesWindowController`） | ❌ 无 | 原型是单页状态；若要 1:1 需要"工作区 = 布局+侧栏+视图的快照"概念 |

### 12.1 三个"原型自创、QSpace 没有"的点（反向差距，避免照原型抄错）

1. **地址栏右键的「编辑地址 / 粘贴并前往」**：`LS`/`BIN` 无此 key（`LS` 只有 `Enter location…` 输入地址… 与 `Go to Path`）。QSpace 的地址编辑是**单击段外区域进入输入**（设置项 `仅支持点击` / `悬停根节点` / `悬停任意节点` 控制触发方式），不是右键菜单项。
2. **列头右键的「多媒体 › / 其他 ›」两级子菜单**：是原型照 Finder 照片做的；QSpace 的列菜单是**一整张扁平勾选清单**（`JHSSpaceListColumnsMenuProvider` + 26 列）。
3. **分组里的「名称首字母」**：QSpace 的分组选项没有它（见 §5.3 十项）。

---

## 附录 A · nib 模块清单（文件名即模块）

### A.1 `Resources/` 根目录下的 26 个 .nib

`JHSAddressEnterController`（输入地址）· `JHSAliDriveAuthController` · `JHSAppNotificationController` · `JHSBaiduNetdiskAuthController` · **`JHSBatchRenameLiteWindowController`** · **`JHSBatchRenameLogsController`** · `JHSBoxDriveAuthController` · `JHSCommentViewController` · **`JHSCompressWindowController`** · `JHSDesktopOptionsWindowController` · **`JHSEditBookmarkViewController`** · `JHSEditWorkspaceNameController` · `JHSEnterPasswordWindowController` · **`JHSFileInspectorController`** · **`JHSLayoutPickerViewController`** · `JHSMSAuthController` · **`JHSProcessConsoleController`** · `JHSProgressViewController` · `JHSShoppingController` · **`JHSSpaceColumnsCellView`** · **`JHSSpaceIconsView`** · **`JHSSpaceListDateCellView` / `JHSSpaceListNameCellView` / `JHSSpaceListPropertyCellView`** · **`JHSSpaceViewRowView`** · **`JHSTaskListWindowController`** · 以及目录型 nib：`JHSAppExclusionsViewController` · **`JHSBatchRenameLoadPresetsController`** · `JHSFolderSyncFiltersController` · **`JHSGotoBookmarkController`** · `JHSSearchListView` · **`JHSSpaceColumnsListView`** · **`JHSSpaceGroupListView`** · `JHSTagViewController` · `JHSWorkspaceChooseController`（各含 `keyedobjects-101500/110000.nib`）。

### A.2 `Base.lproj/` 下的 92 个 .nib（设置页 + 控制器 + 视图）

设置页（23）：`JHSGeneralSettingsView` `JHSAppearanceSettingsView` `JHSBehaviorSettingsView` `JHSPermissionSettingsView_Pro` `JHSServerConnSettingsView` `JHSSearchSettingsView` `JHSQuickLauncherSettingsView` `JHSHotkeySettingsView` `JHSAddressBarSettingsView` `JHSContextMenuSettingsView` `JHSNewfileSettingsView` `JHSFolderSyncSettingsView` `JHSQuickLocationSettingsView` `JHSBatchRenameSettingsView` `JHSCustomIconSettingsView` `JHSPaletteSettingsView` `JHSFileColorSettingsView` `JHSOpenModeSettingsView` `JHSArchiveSettingsView` `JHSAppExtensionsSettingsView` `JHSiCloudSettingsView` `JHSInvitationsSettingsView` `JHSVersionSettingsView`
窗口/控制器：`MainMenu` · `JHSPreferencesWindowController` `JHSPreferencesSideViewController` `JHSPreferencesViewController` · `JHSAboutWindowController` `AcknowledgementsWindowController` · `JHSActivationController` `JHSAccountBindingController` `JHSChangeEmailController` `JHSEnterInvitationViewController` `JHSFeedbackWindowController` `JHSAppUpdateController` `JHSAppDownloadController` `JHSLockLicenseAlertController` `JHSMPQRCodeController` `JHSShoppingController` `JHSProductAliwxPayViewController` `JHSProductPayPalViewController` `JHSProductRedeemController` `JHSShoppingProductsViewController` · `JHSBatchRenameController` `JHSBatchRenameLiteController` `JHSBatchRenameLogController` `JHSBatchRenameSavePresetController` `JHSBatchRenameLoadPresetsController` · `JHSCompressViewController` `JHSEnterPasswordWindowController` `JHSEnterPasswordView` `JHSAddPasswordViewController` `JHSPasswordListViewController` · `JHSFileHashController` `JHSFileInfoController` `JHSFileInfoView` `JHSFileInspectorController` `JHSCommentViewController` `JHSTagViewController` · `JHSConvertImageViewController` `JHSTextProcessorController` `JHSMatchAndSelectController` · `JHSSearchController` `JHSSearchViewController` `JHSSearchListView` · `JHSFolderSyncController` `JHSFolderSyncFilterController` `JHSFolderSyncFiltersController` `JHSFolderSyncPresetController` `JHSFolderSyncProgressController` `JHSFolderSyncViewController` · `JHSSyncSelectController` · `JHSTaskListViewController` `JHSTaskListWindowController` `JHSProgressViewController` `JHSProcessConsoleController` · `JHSEditQuickLauncherController` `JHSEditBookmarkViewController` `JHSEditWorkspaceNameController` `JHSGotoBookmarkController` `JHSWorkspaceChooseController` · `JHSSidebarView` `JHSSpaceListView` `JHSSpaceIconsView` `JHSSpaceColumnsListView` `JHSSpaceColumnsCellView` `JHSSpaceGroupListView` `JHSSpaceViewRowView` `JHSSpaceList{Name,Date,Property}CellView` `JHSSpaceIconsViewOptionsController` `JHSSpaceListViewOptionsController` · `JHSStashShelfView` `JHSStashShelfPopViewController` · `JHSDesktopOptionsViewController` `JHSDesktopOptionsWindowController` · `JHSCustomHiddenItemsViewController` `JHSInputExtensionsViewController` · `JHSLayoutPickerViewController` · `JHSKeyboardAuthController` `JHSRemoteCommandViewController` `JHSServerDirtyFilesController` · `JHSFileOperationConflictWindowController` · `JHSPreferencesExportController` `JHSPreferencesImportController` · 主题行 `JHSThemeColorGroup` `JHSThemeColorRow` `JHSThemeSchemeRow` `JHSCustomThemeEditorView` `JHSCustomThemeListView` · `JHSViewStyleManagerController` `JHSPathSegmentPopViewController` `JHSQuickLocationTableHeaderView/RowView/TableView` · `JHSiCloudSettingsView` · `JHSFolderStyleSettingsViewController`（与 A.1 重复者为同一模块的 Base 版）。

### A.3 其它资源

声音：`EmptyTrash.aif` `FileAdded.aif` `FileRemoved.aif` + `OSX-*` 变体（设置项「操作音效」「音效版本」「当添加或删除文件时播放音效」）；`Assets.car`（应用图标）；`QSpace Pro Beta.icns`；15 份 `JHSKindNameVariants-*.plist`（14 种语言的"种类名"变体，配合 `JHSKindNameVariants` 做搜索/种类匹配）；`JHSFolderEmojiKeywords.json`（文件夹表情符号关键词，配合 `JHSFolderEmojiPicker`/「自定义文件夹…」）。

---

## 附录 B · 本报告引用的运行时配置文件（只读）

```
~/Library/Preferences/com.jinghaoshe.qspace.pro.plist          # 173 个 settings_* 键 + 工具栏排布
~/Library/Application Support/com.jinghaoshe.qspace.pro/
  context_menu/conf.json        # 右键菜单清单（function/service/quicklaunch）
  hotkey.json                   # 101 条快捷键
  sidebar.conf                  # 右侧栏分组（type 1–12）
  bookmarks.conf                # 左侧栏分组
  newfile/conf.json + templates/ # 新建文件模板
  rename/presets.conf           # 快速重命名预置（> zip）
  search.conf / desktop.conf / kind_groups.conf / palette.conf /
  view_styles.conf / server_conns.conf / side_preview_actions.conf /
  quick_launch/conf.json / recent_locations.txt / recent_searches.json
~/Library/Mobile Documents/com~apple~CloudDocs/Qspace Pro/*.qsdata  # 配置导出 zip
  ├── main.conf     # 173 项设置（与 plist 同源）
  ├── toolbar.json  # 工具栏
  ├── guest/spaces/默认.qs  # 工作区布局树（含 expands/visibleColumns/columnWidths）
  └── context_menu/conf.json, hotkey.json, sidebar.conf, bookmarks.conf …
```

---

## 附录 C · 用户点名项的自检（逐项对号）

| 用户点名 | 报告位置 |
|---|---|
| 地址栏右键 | §3.6（含 B 小节 + 反向差距 12.1-1） |
| 分组右键 | §3.5 |
| 收藏 | §3.1-G/§6.5/§6.6 + checklist #8 |
| 磁盘 | §3.4-磁盘 + §6.2 + checklist #9 |
| iCloud | §6.3 + checklist #10 |
| 折叠 | §8 + checklist #17 |
| 分屏 | §7.1 + checklist #18 |
| 拖拽 | §7.3 + checklist #19 |
| 压缩/解压 | §3.1-D、§10.4、§11.2 |
| 重命名/批量重命名 | §3.1-C、§10.2 #14、§11.2 |
| 打开方式 | §3.1-A、§11.2 |
| 新建 | §4 |
| 视图与排序 | §5 |
| 侧栏细节 | §6 |
| 快捷键 | §9 |
| 设置面板 | §10 |
| 文件操作能力全集 | §11 |
| 与原型差距 | §12 |

