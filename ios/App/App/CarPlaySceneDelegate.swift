import UIKit
import CarPlay

/// CarPlay 场景：展示系统 Now Playing 模板（播放状态由 WebKit MediaSession 维护，
/// 模板自动镜像，按钮命令直达同一套 remote command，无需与 JS 通信）。
/// 生效前提：com.apple.developer.carplay-audio entitlement（付费开发者账号申请）。
/// 未签名该权限时 CarPlay 不会连接本场景，声明本身无副作用。
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        interfaceController.setRootTemplate(
            CPNowPlayingTemplate.shared,
            animated: false,
            completion: nil
        )
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController,
        from window: CPWindow
    ) {
        // 断开后系统自行回收模板
    }
}
