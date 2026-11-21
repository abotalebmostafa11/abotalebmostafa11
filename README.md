# C++ Start for VS Code

Created and designed by Associate Professor Mostafa Abotaleb, Yugra State University.

Compile a C++20 file and read its output in Bengali, Arabic, English, and Russian. The extension runs locally on Windows 10, Windows 11, and Apple Silicon Macs, including M4 and M5.

## Install

1. [Download C++ Start 2.2.0 for VS Code](https://raw.githubusercontent.com/abotalebmostafa11/abotalebmostafa11/cppstart-vscode/dist/cppstart-2.2.0.vsix).
2. In VS Code, open **Extensions**, click the **…** menu, and choose **Install from VSIX…**. Select the downloaded file.
3. Open a local C++ file and click **Run C++ (UTF-8)**. The first run sets up the compiler if needed. On macOS, follow Apple's Command Line Tools prompt if it appears.

## Try Bengali output

```cpp
#include <iostream>

int main() {
    std::cout << "বাংলাদেশে স্বাগতম!\n"
              << "مرحباً!\n"
              << "Hello!\n"
              << "Привет!\n";
}
```

Use **C++ Start: Trace issue** to select a compiler error in your source. **Open issue log** opens the local report. The output panel includes a text input field and a theme switch.

[Extension guide](extension/README.md) · [Build and release](tools/RELEASE.md) · [Changelog](extension/CHANGELOG.md) · [License](extension/LICENSE.txt)
