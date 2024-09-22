import {WindRoseRendererStandaard} from "./WindRoseRendererStandaard";
import {WindBarRenderer} from "./WindBarRenderer";
import {PercentageCalculator} from "./PercentageCalculator";
import {WindSpeedConverter} from "../converter/WindSpeedConverter";
import {CardConfigWrapper} from "../config/CardConfigWrapper";
import {WindRoseConfigFactory} from "../config/WindRoseConfigFactory";
import {MeasurementCounter} from "../counter/MeasurementCounter";
import {WindRoseData} from "./WindRoseData";
import {WindRoseRendererCenterCalm} from "./WindRoseRendererCenterCalm";
import {PercentageCalculatorCenterCalm} from "./PercentageCalculatorCenterCalm";
import {WindRoseRenderer} from "./WindRoseRenderer";
import {HomeAssistantMeasurementProvider} from "../measurement-provider/HomeAssistantMeasurementProvider";
import {DimensionConfig} from "./DimensionConfig";
import {CurrentDirectionRenderer} from "./CurrentDirectionRenderer";
import {EntityStates} from "../entity-state-processing/EntityStates";
import {DegreesCalculator} from "./DegreesCalculator";
import {Log2} from "../util/Log2";

export class WindRoseDirigent {
    //Util
    private readonly log = new Log2("WindRoseDirigent");
    private windSpeedConverter!: WindSpeedConverter;

    //Config
    private configFactory!: WindRoseConfigFactory;
    private cardConfig!: CardConfigWrapper;

    //Measurements
    private measurementProvider!: HomeAssistantMeasurementProvider;
    private measurementCounter!: MeasurementCounter;
    private percentageCalculator!: PercentageCalculator;

    //Rendering
    private degreesCalculator!: DegreesCalculator;
    private dimensionConfig!: DimensionConfig;
    private windRoseRenderer!: WindRoseRenderer;
    private windBarRenderers: WindBarRenderer[] = [];
    private currentDirectionRenderer!: CurrentDirectionRenderer;

    //Calculated data
    private windRoseData: WindRoseData[] = [];

    private readonly svg: Snap.Paper;
    private initReady = false;
    private measurementsReady = false;
    private entityStates!: EntityStates;

    constructor(svg: Snap.Paper) {
        this.svg = svg;
    }

    init(cardConfig: CardConfigWrapper, measurementProvider: HomeAssistantMeasurementProvider): void {
        this.log.debug("init()");
        this.initReady = true;
        this.measurementsReady = false;
        this.cardConfig = cardConfig;
        this.measurementProvider = measurementProvider;
        this.configFactory = new WindRoseConfigFactory(cardConfig);
        const windRoseConfig = this.configFactory.createWindRoseConfig();
        this.windSpeedConverter = new WindSpeedConverter(cardConfig.outputSpeedUnit, cardConfig.speedRangeBeaufort,
            cardConfig.speedRangeStep, cardConfig.speedRangeMax, cardConfig.speedRanges);

        this.measurementCounter = new MeasurementCounter(windRoseConfig, this.windSpeedConverter);
        this.dimensionConfig = new DimensionConfig(cardConfig.windBarCount(), cardConfig.windspeedBarLocation);
        this.degreesCalculator = new DegreesCalculator(cardConfig.windRoseDrawNorthOffset, false);

        if (this.cardConfig.centerCalmPercentage) {
            this.percentageCalculator = new PercentageCalculatorCenterCalm();
            this.windRoseRenderer = new WindRoseRendererCenterCalm(windRoseConfig, this.dimensionConfig, this.windSpeedConverter.getSpeedRanges(), this.svg, this.degreesCalculator);
        } else {
            this.percentageCalculator = new PercentageCalculator();
            this.windRoseRenderer = new WindRoseRendererStandaard(windRoseConfig, this.dimensionConfig, this.windSpeedConverter.getSpeedRanges(), this.svg, this.degreesCalculator);
        }
        this.currentDirectionRenderer = new CurrentDirectionRenderer(windRoseConfig, this.dimensionConfig, this.svg);

        this.windBarRenderers = [];
        if (!cardConfig.hideWindspeedBar) {
            const barConfigs = this.configFactory.createWindBarConfigs();
            for (let i = 0; i < cardConfig.windBarCount(); i++) {
                this.windBarRenderers.push(new WindBarRenderer(barConfigs[i], this.dimensionConfig, this.windSpeedConverter.getOutputSpeedUnit(), i, this.svg));
            }
        }

        this.windRoseData = [];
    }

    refreshData(): Promise<boolean> {
        if (this.initReady) {
            this.log.debug('refreshData()');
            return this.measurementProvider.getMeasurements().then((matchedGroups) => {
                this.windRoseData = [];
                this.log.debug('Matched measurements:', matchedGroups);
                for (let i = 0; i < matchedGroups.length; i++) {
                    this.measurementCounter.init(this.cardConfig.windspeedEntities[i].speedUnit);
                    for (const measurement of matchedGroups[i]) {
                        this.measurementCounter.addWindMeasurements(measurement.direction, measurement.speed);
                    }
                    const windCounts = this.measurementCounter.getMeasurementCounts();
                    this.windRoseData.push(this.percentageCalculator.calculate(windCounts));
                }
                this.measurementsReady = true;
                return Promise.resolve(true);
            });
        } else {
            this.log.debug('refreshData() ignored, not inited yet');
            return Promise.resolve(false);
        }
    }

    render(): void {
        this.svg.clear();
        if (this.initReady && this.measurementsReady) {
            this.log.debug('render()', this.svg, this.windRoseData, this.windBarRenderers);
            if (this.cardConfig.showCurrentDirectionArrow) {
                this.currentDirectionRenderer.drawCurrentWindDirection(this.degreesCalculator.getWindDirectionRenderDegrees(), true);
            }
            this.windRoseRenderer.drawWindRose(this.windRoseData[0]);
            for (let i = 0; i < this.windBarRenderers.length; i++) {
                this.windBarRenderers[i].drawWindBar(this.windRoseData[i]);
            }
        } else {
            this.log.error("render(): Could not render, init or measurementsn not ready " + this.initReady + " - "  + this.measurementsReady);
        }
    }

    updateEntityStates(entityStates: EntityStates) {
        this.log.debug("updateEntityStates()", entityStates);
        this.entityStates = entityStates;
        if (entityStates.updateWindDirection) {
            this.degreesCalculator.setWindDirectionDegrees(+(entityStates.currentWindDirection as number));
            this.currentDirectionRenderer.drawCurrentWindDirection(this.degreesCalculator.getWindDirectionRenderDegrees(), false);
        }
    }

    // updateEntityStates(entityStates: EntityStates, svg: Snap.Paper) {
    //     if (entityStates.hasUpdates()) {
    //         if (entityStates.currentCompassDirection !== undefined) {
    //             this.degreesCalculator.setCompassDegrees(entityStates.currentCompassDirection);
    //         }
    //         if (entityStates.currentWindDirection !== undefined) {
    //             this.degreesCalculator.setWindDirectionDegrees(entityStates.currentWindDirection);
    //         }
    //         if (this.cardConfig.showCurrentDirectionArrow) {
    //             this.currentDirectionRenderer.drawCurrentWindDirection(svg);
    //         }
    //         if (this.cardConfig.autoRotateByEntity) {
    //             this.windRoseRenderer.rotateWindRose();
    //         }
    //     }
    // }

}
