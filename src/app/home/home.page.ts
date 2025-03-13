import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Howl } from 'howler'; // Bibliothèque pour gérer le son
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import Chart from 'chart.js/auto';
import { IonReorderGroup } from '@ionic/angular';

interface Task {
  id: number;
  name: string;
  timeLeft: number;
  interval?: any;
  cycles: number;
  isRunning: boolean;
  workSessions: number;
  color: string;
}
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage  implements AfterViewInit {
  @ViewChild('barChart') barChart!: ElementRef;
  @ViewChild('pieChart') pieChart!: ElementRef;
  @ViewChild('donutChart') donutChart!: ElementRef;

  tasks: Task[] = [];
  workTime = 25 * 60;
  shortBreakTime = 5 * 60;
  longBreakTime = 15 * 60;
  //alarm = new Howl({ src: ['assets/alarm.mp3'] });
  alarm!: Howl;

  barChartInstance!: Chart;
  pieChartInstance!: Chart;
  donutChartInstance!: Chart;

  constructor() {
    this.loadTasks();
  }

  initAlarm() {
    if (!this.alarm) {
      this.alarm = new Howl({ src: ['assets/alarm.mp3'] });
    }
  }
  
  async loadTasks() {
    const savedTasks = await Preferences.get({ key: 'tasks' });
    if (savedTasks.value) {
      this.tasks = JSON.parse(savedTasks.value);
    }
    this.updateCharts();
  }

  async saveTasks() {
    await Preferences.set({ key: 'tasks', value: JSON.stringify(this.tasks) });
    this.updateCharts();
  }

  addTask(taskName: string) {
    if (taskName.trim()) {
      const newTask: Task = {
        id: Date.now(),
        name: taskName,
        timeLeft: this.workTime,
        cycles: 0,
        isRunning: false,
        workSessions: 0,
        color: this.getRandomColor(), // Générer une couleur unique pour chaque tâche
      };
      this.tasks.push(newTask);
      this.saveTasks();
      this.updateCharts();
    }
  }

  startTimer(task: Task) {
    this.initAlarm();

    if (task.isRunning) return;

    task.isRunning = true;
    task.interval = setInterval(() => {
      if (task.timeLeft > 0) {
        task.timeLeft--;
      } else {
        this.endSession(task);
      }
      this.saveTasks();
      this.updateCharts();
    }, 1000);
  }

  async endSession(task: Task) {
    clearInterval(task.interval);
    this.initAlarm();
    this.alarm.play();
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await this.sendNotification(`${task.name} - Session terminée !`);
  
    task.cycles++;
    task.workSessions++; // Incrémentation du compteur de sessions complétées
    task.isRunning = false;
  
    // Déterminer si c'est une pause longue ou courte
    let breakTime = 0;
    if (task.cycles % 4 === 0) {
      breakTime = this.longBreakTime; // Pause longue
    } else if (task.cycles % 2 === 0) {
      breakTime = this.shortBreakTime; // Pause courte
    } else {
      breakTime = this.workTime; // Session de travail
    }
  
    // Créer une nouvelle tâche "Pause"
    const breakTask: Task = {
      id: Date.now(),
      name: `${task.name} - Pause`,
      timeLeft: breakTime,
      cycles: task.cycles,
      isRunning: false,
      workSessions: task.workSessions,
      color: this.getRandomColor(),
    };
  
    // Ajouter cette tâche "Pause" à la liste des tâches
    this.tasks.push(breakTask);
  
    // Mettre à jour la tâche de travail
    task.timeLeft = this.workTime; // Réinitialiser la tâche de travail
    this.saveTasks();
    this.updateCharts();
  }
  

  pauseTimer(task: Task) {
    clearInterval(task.interval);
    task.isRunning = false;
    this.saveTasks();
    this.updateCharts();
  }

  resetTimer(task: Task) {
    clearInterval(task.interval);
    task.timeLeft = this.workTime;
    task.isRunning = false;
    this.saveTasks();
  }

  removeTask(taskId: number) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.saveTasks();
    this.updateCharts();
  }

  formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  getProgress(task: Task): number {
    const totalTime = task.cycles % 4 === 0 ? this.longBreakTime :
                      task.cycles % 2 === 0 ? this.shortBreakTime : this.workTime;
    return (1 - task.timeLeft / totalTime) * 100;
  }

  async sendNotification(message: string) {
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Pomodoro',
          body: message,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + 1000) },
          sound: 'assets/alarm.mp3',
        },
      ],
    });
  }

  ngAfterViewInit() {
    this.createCharts();
  }

  createCharts() {
    if (this.barChartInstance) this.barChartInstance.destroy();
    if (this.pieChartInstance) this.pieChartInstance.destroy();
    if (this.donutChartInstance) this.donutChartInstance.destroy();

    const taskNames = this.tasks.map(t => t.name);

    const taskWorkSessions = this.tasks.map(t => t.workSessions);

    // 🔹 1️⃣ Calcul du temps total de toutes les tâches et pauses
    const totalTaskTime = this.tasks.reduce((sum, task) => sum + this.workTime, 0);
    
    // 🔹 2️⃣ Calcul du temps restant total (toutes tâches + pauses)
    const totalTimeLeft = this.tasks.reduce((sum, task) => sum + task.timeLeft, 0);

    // 🔹 3️⃣ Trouver la tâche en cours et son temps restant
    const currentTask = this.tasks.find(task => task.isRunning);
    const currentTaskTime = currentTask ? currentTask.timeLeft : 0;
    const currentTaskTotalTime = currentTask ? this.workTime : 1; 

    this.barChartInstance = new Chart(this.barChart.nativeElement, {
      type: 'bar',
      data: {
        labels: taskNames,
        datasets: [{
          label: 'Sessions terminées',
          data: taskWorkSessions,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
        }]
      }
    });

    this.pieChartInstance = new Chart(this.pieChart.nativeElement, {
      type: 'pie',
      data: {
        labels: ['Travail', 'Pause courte', 'Pause longue'],
        datasets: [{
          data: [
            this.tasks.reduce((sum, t) => sum + t.workSessions * 25, 0),
            this.tasks.reduce((sum, t) => sum + t.cycles * 5, 0),
            this.tasks.reduce((sum, t) => sum + Math.floor(t.cycles / 4) * 15, 0),
          ],
          backgroundColor: ['#ff6384', '#36a2eb', '#ffce56'],
        }]
      }
    });

    this.donutChartInstance = new Chart(this.donutChart.nativeElement, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            // 🌍 Grand cercle externe : Temps total (toutes les tâches)
            data: [totalTimeLeft, totalTaskTime - totalTimeLeft], // Temps restant, écoulé
            backgroundColor: ['#36a2eb', '#e0e0e0'], // 🔵 Bleu (restant) - ⚪ Gris (écoulé)
            borderWidth: 0,
          },
          {
            // 🔴 Petit cercle interne : Temps de la tâche en cours
            data: [currentTaskTime, currentTaskTotalTime - currentTaskTime], // Temps restant, écoulé
            backgroundColor: ['#ff6384', '#e0e0e0'], // 🔴 Rouge (tâche en cours) - ⚪ Gris (écoulé)
            borderWidth: 0,
          }
        ],
      },
      options: {
        responsive: true,
        cutout: '60%', // Définition correcte du cutout pour bien afficher les cercles
        plugins: {
          legend: { display: false }, // Cache la légende pour plus de clarté
        },
      },
    });

  }

  updateCharts() {
    if (!this.donutChartInstance) {
      this.createCharts();
      return;
    }
  
    // 🔹 1️⃣ Calcul du temps total et du temps restant
    const totalTaskTime = this.tasks.reduce((sum, task) => sum + this.workTime, 0);
    const totalTimeLeft = this.tasks.reduce((sum, task) => sum + task.timeLeft, 0);
  
    // 🔹 2️⃣ Trouver la tâche en cours
    const currentTask = this.tasks.find(task => task.isRunning);
    const currentTaskTime = currentTask ? currentTask.timeLeft : 0;
    const currentTaskTotalTime = currentTask ? this.workTime : 1; // Évite division par zéro
  
    // 🔄 Mise à jour des datasets **sans recréer** le graphique
    this.donutChartInstance.data.datasets[0].data = [totalTimeLeft, totalTaskTime - totalTimeLeft];
    this.donutChartInstance.data.datasets[1].data = [currentTaskTime, currentTaskTotalTime - currentTaskTime];
  
    // ✅ Appliquer les changements **sans flash**
    this.donutChartInstance.update();
  }
  
  updateCharts2() {
    setTimeout(() => this.createCharts(), 500);
  }

  getRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  reorderTasks(event: any) {
    const itemMove = this.tasks.splice(event.detail.from, 1)[0];
    this.tasks.splice(event.detail.to, 0, itemMove);
    event.detail.complete();
    this.saveTasks();
  }
}