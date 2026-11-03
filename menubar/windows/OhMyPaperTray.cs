// oh-my-paper tray companion for Windows: the counterpart of menubar/main.swift.
// Shows whether the local web server (127.0.0.1:8788) is running, starts it with node and tsx
// when it is not, and opens the reader in the browser. The user's Run key starts it at sign-in,
// so neither it nor the server is a child of a console that may close: `oh-my-paper menubar`
// builds it with the C# compiler of the .NET Framework that every Windows 10 and 11 carries, and
// starts it.
//
// That compiler speaks C# 5: no string interpolation, no ?. operator, no expression bodies.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OhMyPaper
{
  internal sealed class Options
  {
    public string Repo = "";
    public string Port = "8788";
    public string Node = "";
    public bool WriteLoginItem;

    public string Origin
    {
      get { return "http://127.0.0.1:" + Port; }
    }
  }

  internal enum ServerState { Running, Starting, Stopped }

  internal static class Program
  {
    internal const double HealthInterval = 5;
    internal const double StartingBudget = 30;
    internal const double RespawnBackoff = 60;
    internal const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string RunValue = "oh-my-paper";

    internal static readonly string DataFolder = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "oh-my-paper");
    internal static readonly string LogPath = Path.Combine(DataFolder, "Logs", "tray.log");
    // PATH and the OH_MY_PAPER_* settings of the console that installed the companion, the way
    // the macOS agent carries them: Windows starts Run-key programs with only the stored ones.
    internal static readonly string EnvironmentPath = Path.Combine(DataFolder, "tray.env");

    private static readonly object LogLock = new object();

    internal static bool Korean
    {
      get
      {
        string chosen = Environment.GetEnvironmentVariable("OH_MY_PAPER_LANG") ?? "";
        if (chosen.StartsWith("ko", StringComparison.OrdinalIgnoreCase)) return true;
        if (chosen.StartsWith("en", StringComparison.OrdinalIgnoreCase)) return false;
        return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ko";
      }
    }

    internal static string Text(string ko, string en)
    {
      return Korean ? ko : en;
    }

    internal static void Log(string line)
    {
      lock (LogLock)
      {
        try
        {
          Directory.CreateDirectory(Path.GetDirectoryName(LogPath));
          File.AppendAllText(LogPath, line + Environment.NewLine, Encoding.UTF8);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
      }
    }

    /// <summary>One argument quoted the way Windows programs split their command line.</summary>
    internal static string Quote(string value)
    {
      if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
      StringBuilder builder = new StringBuilder("\"");
      int backslashes = 0;
      foreach (char c in value)
      {
        if (c == '\\')
        {
          backslashes += 1;
          continue;
        }
        if (c == '"')
        {
          builder.Append('\\', backslashes * 2 + 1);
        }
        else
        {
          builder.Append('\\', backslashes);
        }
        builder.Append(c);
        backslashes = 0;
      }
      builder.Append('\\', backslashes * 2);
      builder.Append('"');
      return builder.ToString();
    }

    private static Options Parse(string[] args)
    {
      Options options = new Options();
      for (int i = 0; i < args.Length; i += 1)
      {
        string next = i + 1 < args.Length ? args[i + 1] : null;
        switch (args[i])
        {
          case "--repo":
            if (next != null) options.Repo = next;
            i += 1;
            break;
          case "--port":
            if (next != null) options.Port = next;
            i += 1;
            break;
          case "--node":
            if (next != null) options.Node = next;
            i += 1;
            break;
          case "--write-login-item":
            options.WriteLoginItem = true;
            break;
        }
      }
      if (options.Repo.Length == 0) options.Repo = Environment.CurrentDirectory;
      options.Repo = Path.GetFullPath(options.Repo);
      return options;
    }

    internal static string ExecutablePath()
    {
      return Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
    }

    /// <summary>
    /// Starts the companion at sign-in from the user's Run key (no administrator rights needed),
    /// with the settings of the console that ran it kept beside it for that start.
    /// </summary>
    internal static void WriteLoginItem(Options options)
    {
      StringBuilder command = new StringBuilder();
      command.Append(Quote(ExecutablePath()));
      command.Append(" --repo ").Append(Quote(options.Repo));
      command.Append(" --port ").Append(Quote(options.Port));
      if (options.Node.Length > 0) command.Append(" --node ").Append(Quote(options.Node));
      using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
      {
        key.SetValue(RunValue, command.ToString(), RegistryValueKind.String);
      }
      StringBuilder saved = new StringBuilder();
      foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
      {
        string name = (string)entry.Key;
        if (name.Equals("PATH", StringComparison.OrdinalIgnoreCase) ||
            name.StartsWith("OH_MY_PAPER_", StringComparison.OrdinalIgnoreCase))
        {
          saved.Append(name).Append('=').Append((string)entry.Value).Append('\n');
        }
      }
      Directory.CreateDirectory(DataFolder);
      File.WriteAllText(EnvironmentPath, saved.ToString(), new UTF8Encoding(false));
    }

    internal static void RemoveLoginItem()
    {
      using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, true))
      {
        if (key != null) key.DeleteValue(RunValue, false);
      }
    }

    internal static bool LoginItemExists()
    {
      using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, false))
      {
        return key != null && key.GetValue(RunValue) != null;
      }
    }

    /// <summary>
    /// Takes on the saved settings: their PATH entries go first, the ones Windows gave this
    /// start follow, so programs installed since are found as well.
    /// </summary>
    private static void LoadSavedEnvironment()
    {
      if (!File.Exists(EnvironmentPath)) return;
      foreach (string line in File.ReadAllLines(EnvironmentPath, Encoding.UTF8))
      {
        int split = line.IndexOf('=');
        if (split <= 0) continue;
        string name = line.Substring(0, split);
        string value = line.Substring(split + 1);
        if (name.Equals("PATH", StringComparison.OrdinalIgnoreCase))
        {
          List<string> entries = new List<string>(value.Split(';'));
          foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
          {
            if (entry.Length > 0 && !entries.Exists(e => e.Equals(entry, StringComparison.OrdinalIgnoreCase)))
              entries.Add(entry);
          }
          Environment.SetEnvironmentVariable("PATH", string.Join(";", entries.ToArray()));
        }
        else
        {
          Environment.SetEnvironmentVariable(name, value);
        }
      }
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    private static int Main(string[] args)
    {
      Options options = Parse(args);
      if (options.WriteLoginItem)
      {
        try
        {
          WriteLoginItem(options);
          Console.WriteLine(RunValue);
          return 0;
        }
        catch (Exception error)
        {
          Console.Error.WriteLine(error.Message);
          return 1;
        }
      }

      bool created;
      using (Mutex single = new Mutex(true, @"Local\oh-my-paper-tray", out created))
      {
        // One companion per signed-in user: a second start, at sign-in or by hand, leaves.
        if (!created) return 0;
        try
        {
          LoadSavedEnvironment();
        }
        catch (Exception error)
        {
          Log("[tray] could not read " + EnvironmentPath + ": " + error.Message);
        }
        try
        {
          SetProcessDPIAware();
        }
        catch (EntryPointNotFoundException)
        {
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += (sender, e) => Log("[tray] " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException +=
          (sender, e) => Log("[tray] " + e.ExceptionObject);
        Log("[tray] " + DateTime.Now.ToString("s") + " started for " + options.Repo);
        Application.Run(new TrayContext(options));
      }
      return 0;
    }
  }

  internal sealed class TrayContext : ApplicationContext
  {
    private readonly Options options;
    private readonly NotifyIcon icon = new NotifyIcon();
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly ToolStripMenuItem statusItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem openItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem loginItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem quitItem = new ToolStripMenuItem();
    private readonly Icon runningIcon;
    private readonly Icon idleIcon;
    private readonly SynchronizationContext ui;
    private Process child;
    private ServerState state = ServerState.Stopped;
    private DateTime startingSince = DateTime.MinValue;
    private DateTime lastSpawnAt = DateTime.MinValue;
    private bool ticking;

    public TrayContext(Options options)
    {
      this.options = options;
      ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
      runningIcon = LeafIcon(1f);
      // The leaf dims while the server is not answering.
      idleIcon = LeafIcon(0.45f);

      statusItem.Enabled = false;
      openItem.Text = Program.Text("리더 열기", "Open reader");
      openItem.Click += (sender, e) => OpenReader();
      loginItem.Text = Program.Text("로그인 시 자동 실행", "Start at sign-in");
      loginItem.Click += (sender, e) => ToggleLogin();
      quitItem.Text = Program.Text("종료", "Quit");
      quitItem.Click += (sender, e) => Quit();
      ContextMenuStrip menu = new ContextMenuStrip();
      menu.Items.Add(statusItem);
      menu.Items.Add(openItem);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add(loginItem);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add(quitItem);

      icon.ContextMenuStrip = menu;
      icon.Icon = idleIcon;
      icon.DoubleClick += (sender, e) => OpenReader();
      // A left click opens the menu too, as the menu bar item does on macOS.
      icon.MouseUp += (sender, e) =>
      {
        if (e.Button != MouseButtons.Left) return;
        MethodInfo show = typeof(NotifyIcon).GetMethod(
          "ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic);
        if (show != null) show.Invoke(icon, null);
      };
      icon.Visible = true;

      Application.ApplicationExit += (sender, e) => StopServer();
      timer.Interval = (int)(Program.HealthInterval * 1000);
      timer.Tick += (sender, e) => Tick();
      timer.Start();
      Refresh();
      Tick();
    }

    private Icon LeafIcon(float opacity)
    {
      Size size = SystemInformation.SmallIconSize;
      Bitmap canvas = new Bitmap(size.Width, size.Height, PixelFormat.Format32bppArgb);
      string mark = Path.Combine(options.Repo, "assets", "branding", "ohmypaper-leaf-mark.png");
      try
      {
        using (Image leaf = Image.FromFile(mark))
        using (Graphics graphics = Graphics.FromImage(canvas))
        using (ImageAttributes attributes = new ImageAttributes())
        {
          ColorMatrix matrix = new ColorMatrix();
          matrix.Matrix33 = opacity;
          attributes.SetColorMatrix(matrix);
          graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          graphics.DrawImage(leaf, new Rectangle(0, 0, size.Width, size.Height),
            0, 0, leaf.Width, leaf.Height, GraphicsUnit.Pixel, attributes);
        }
        return Icon.FromHandle(canvas.GetHicon());
      }
      catch (Exception error)
      {
        Program.Log("[tray] no leaf icon (" + error.Message + ")");
        return SystemIcons.Application;
      }
    }

    private static async Task<bool> Probe(string origin)
    {
      try
      {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(origin + "/api/workspace");
        request.Proxy = null;
        Task<WebResponse> response = request.GetResponseAsync();
        if (await Task.WhenAny(response, Task.Delay(2000)) != response)
        {
          request.Abort();
          return false;
        }
        using (HttpWebResponse http = (HttpWebResponse)await response)
        {
          int code = (int)http.StatusCode;
          return code >= 200 && code < 300;
        }
      }
      catch (WebException)
      {
        return false;
      }
      catch (InvalidOperationException)
      {
        return false;
      }
    }

    private async void Tick()
    {
      if (ticking) return;
      ticking = true;
      try
      {
        bool alive = await Probe(options.Origin);
        DateTime now = DateTime.UtcNow;
        if (alive)
        {
          state = ServerState.Running;
        }
        else if (child != null)
        {
          state = (now - startingSince).TotalSeconds < Program.StartingBudget
            ? ServerState.Starting
            : ServerState.Stopped;
        }
        else
        {
          state = ServerState.Stopped;
        }
        if (state == ServerState.Stopped && child == null &&
            (now - lastSpawnAt).TotalSeconds > Program.RespawnBackoff)
        {
          SpawnServer();
        }
        Refresh();
      }
      finally
      {
        ticking = false;
      }
    }

    private string NodeExecutable()
    {
      return options.Node.Length > 0 && File.Exists(options.Node) ? options.Node : "node";
    }

    private void SpawnServer()
    {
      string cli = Path.Combine(options.Repo, "node_modules", "tsx", "dist", "cli.mjs");
      if (!File.Exists(cli)) return;
      ProcessStartInfo info = new ProcessStartInfo(
        NodeExecutable(), Program.Quote(cli) + " " + Program.Quote(Path.Combine("src", "server", "main.ts")));
      info.WorkingDirectory = options.Repo;
      info.UseShellExecute = false;
      // No console window: the server and every program it starts share one that is hidden.
      info.CreateNoWindow = true;
      info.RedirectStandardOutput = true;
      info.RedirectStandardError = true;
      info.StandardOutputEncoding = Encoding.UTF8;
      info.StandardErrorEncoding = Encoding.UTF8;
      Process process = new Process();
      process.StartInfo = info;
      process.EnableRaisingEvents = true;
      process.OutputDataReceived += (sender, e) => { if (e.Data != null) Program.Log(e.Data); };
      process.ErrorDataReceived += (sender, e) => { if (e.Data != null) Program.Log(e.Data); };
      process.Exited += (sender, e) => ui.Post(_ =>
      {
        if (child == process) child = null;
        Tick();
      }, null);
      try
      {
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        child = process;
        state = ServerState.Starting;
        startingSince = DateTime.UtcNow;
        lastSpawnAt = startingSince;
        Program.Log("[tray] started the server (" + NodeExecutable() + ")");
      }
      catch (Exception error)
      {
        lastSpawnAt = DateTime.UtcNow;
        state = ServerState.Stopped;
        Program.Log("[tray] could not start the server: " + error.Message);
      }
    }

    private string StatusLabel()
    {
      switch (state)
      {
        case ServerState.Running:
          return Program.Text("서버 실행 중", "Server running") + " — " + options.Origin;
        case ServerState.Starting:
          return Program.Text("서버 시작 중…", "Server starting…");
        default:
          return Program.Text("서버 중지됨", "Server stopped");
      }
    }

    private void Refresh()
    {
      statusItem.Text = "oh-my-paper — " + StatusLabel();
      openItem.Enabled = state == ServerState.Running;
      loginItem.Checked = Program.LoginItemExists();
      string tip = "oh-my-paper — " + StatusLabel();
      // The notification area keeps a tooltip under 64 characters.
      icon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
      icon.Icon = state == ServerState.Running ? runningIcon : idleIcon;
    }

    private void OpenReader()
    {
      if (state != ServerState.Running) return;
      try
      {
        Process.Start(new ProcessStartInfo(options.Origin) { UseShellExecute = true });
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not open the browser: " + error.Message);
      }
    }

    private void ToggleLogin()
    {
      try
      {
        if (Program.LoginItemExists()) Program.RemoveLoginItem();
        else Program.WriteLoginItem(options);
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not change the sign-in start: " + error.Message);
      }
      Refresh();
    }

    /// <summary>Stops the server with everything it started; Windows sends it no signal to act on.</summary>
    private void StopServer()
    {
      Process running = child;
      child = null;
      if (running == null) return;
      try
      {
        if (running.HasExited) return;
        ProcessStartInfo kill = new ProcessStartInfo(
          "taskkill.exe", "/PID " + running.Id.ToString(CultureInfo.InvariantCulture) + " /T /F");
        kill.UseShellExecute = false;
        kill.CreateNoWindow = true;
        using (Process taskkill = Process.Start(kill))
        {
          taskkill.WaitForExit(10000);
        }
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not stop the server: " + error.Message);
      }
    }

    private void Quit()
    {
      timer.Stop();
      StopServer();
      icon.Visible = false;
      ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        timer.Dispose();
        icon.Dispose();
      }
      base.Dispose(disposing);
    }
  }
}
